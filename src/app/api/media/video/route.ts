/**
 * POST /api/media/video
 *
 * Render a property tour video via AiStaging's Remotion Lambda pipeline.
 * Returns 202 accepted — result comes via webhook.
 *
 * Body: { property_id, slides: [{ image_id, caption? }], text_style?, agent_name?, brokerage_name? }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { createServiceClient } from "@/lib/supabase-server";
import { reportUsage, makeIdempotencyKey, RETAIL_PRICES } from "@/lib/billing/simplerpay";
import { renderVideo } from "@/lib/aistaging-client";
import { ensureAiStagingProject } from "@/lib/media/aistaging-helpers";

export const maxDuration = 30;

const LOG_PREFIX = "[Video]";

interface SlideInput {
  image_id: string;
  caption?: string;
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let body: {
    property_id?: string;
    slides?: SlideInput[];
    text_style?: "modern" | "elegant" | "minimal" | "bold" | "luxury";
    agent_name?: string;
    brokerage_name?: string;
    agent_logo_url?: string;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON");
  }

  const { property_id, slides, text_style, agent_name, brokerage_name, agent_logo_url } = body;

  if (!property_id || !slides || slides.length === 0) {
    return apiError("property_id and slides are required");
  }

  if (slides.length > 20) {
    return apiError("Maximum 20 slides per video");
  }

  const supabase = await createServiceClient();

  // Verify property ownership
  const { data: property, error: propError } = await supabase
    .from("properties")
    .select("id, address, user_id, team_id, aistaging_project_id")
    .eq("id", property_id)
    .single();

  if (propError || !property) {
    return apiError("Property not found", 404);
  }

  if (property.user_id !== user!.id) {
    return apiError("Not authorized", 403);
  }

  // Resolve slide image URLs from property_media
  const imageIds = slides.map((s) => s.image_id);
  const { data: mediaRecords, error: mediaError } = await supabase
    .from("property_media")
    .select("id, url")
    .eq("property_id", property_id)
    .in("id", imageIds);

  if (mediaError || !mediaRecords || mediaRecords.length === 0) {
    return apiError("No valid images found for video", 404);
  }

  const urlMap = new Map(mediaRecords.map((m) => [m.id, m.url]));
  const resolvedSlides = slides
    .filter((s) => urlMap.has(s.image_id))
    .map((s) => ({
      image_url: urlMap.get(s.image_id)!,
      caption: s.caption,
    }));

  if (resolvedSlides.length === 0) {
    return apiError("No images could be resolved for video");
  }

  // 1. Charge SimplerPay
  const idempotencyKey = makeIdempotencyKey("tour_video", property_id, String(resolvedSlides.length));

  const billingResult = await reportUsage({
    user_email: user!.email!,
    action: "tour_video",
    cost_cents: RETAIL_PRICES.tour_video,
    idempotency_key: idempotencyKey,
    metadata: { property_id, slide_count: resolvedSlides.length },
  });

  if (!billingResult.ok) {
    if (billingResult.status === 429) {
      return apiError("Spending cap exceeded. Please add funds to continue.", 429);
    }
    return apiError(`Billing failed: ${billingResult.error}`, 502);
  }

  console.log(`${LOG_PREFIX} Charged $${(RETAIL_PRICES.tour_video / 100).toFixed(2)} for video`);

  // 2. Ensure AiStaging project
  let aistagingProjectId: string;
  try {
    aistagingProjectId = await ensureAiStagingProject(
      property as { id: string; address: string; aistaging_project_id: string | null },
      user!.email!,
      supabase,
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} Project creation failed:`, err);
    return apiError("AI service temporarily unavailable", 503);
  }

  // 3. Call AiStaging render
  const renderResult = await renderVideo(aistagingProjectId, {
    agent_name,
    agent_logo_url,
    brokerage_name,
    property_address: property.address,
    slides: resolvedSlides,
    text_style: text_style || "modern",
  });

  if (!renderResult.ok) {
    console.error(`${LOG_PREFIX} AiStaging render failed:`, renderResult.error);
    return apiError(`Video rendering failed: ${renderResult.error}`, 502);
  }

  const { job_id, estimated_seconds } = renderResult.data;

  // 4. Insert pending video record
  const { data: newMedia } = await supabase
    .from("property_media")
    .insert({
      property_id,
      type: "video",
      url: "", // Placeholder — webhook fills this
      ai_service: "video",
      status: "processing",
      aistaging_job_id: job_id,
      billing_ref: idempotencyKey,
      cost_cents: RETAIL_PRICES.tour_video,
    })
    .select("id")
    .single();

  console.log(
    `${LOG_PREFIX} Job ${job_id}: rendering video (est. ${estimated_seconds}s) for property=${property_id}`,
  );

  return NextResponse.json(
    {
      job_id,
      media_id: newMedia?.id,
      status: "rendering",
      estimated_seconds,
    },
    { status: 202 },
  );
}
