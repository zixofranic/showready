/**
 * POST /api/media/enhance
 *
 * Apply AI enhancement to a property photo.
 * Supports: twilight, sky, declutter, upscale, sky_lighting
 *
 * Body: { property_id, image_id, service, options? }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { createServiceClient } from "@/lib/supabase-server";
import {
  reportUsage,
  makeIdempotencyKey,
  RETAIL_PRICES,
  type AIService,
} from "@/lib/billing/simplerpay";
import { processImage, type AIServiceType } from "@/lib/aistaging-client";
import { ensureAiStagingProject } from "@/lib/media/aistaging-helpers";

export const maxDuration = 60;

const LOG_PREFIX = "[Enhance]";

// Map AiStaging service names to SimplerPay billing actions
const SERVICE_TO_BILLING: Record<string, AIService> = {
  twilight: "twilight",
  sky: "sky_replace",
  sky_lighting: "sky_replace",
  declutter: "declutter",
  upscale: "upscale",
};

// Map services to property_media type column
const SERVICE_TO_MEDIA_TYPE: Record<string, string> = {
  twilight: "twilight",
  sky: "sky",
  sky_lighting: "sky",
  declutter: "declutter",
  upscale: "upscale",
};

const VALID_SERVICES: AIServiceType[] = ["twilight", "sky", "declutter", "upscale", "sky_lighting"];

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let body: {
    property_id?: string;
    image_id?: string;
    service?: string;
    options?: { sky_type?: "day" | "dusk" | "night"; scale?: 2 | 4 };
  };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON");
  }

  const { property_id, image_id, service, options } = body;

  if (!property_id || !image_id || !service) {
    return apiError("property_id, image_id, and service are required");
  }

  if (!VALID_SERVICES.includes(service as AIServiceType)) {
    return apiError(`Invalid service. Must be one of: ${VALID_SERVICES.join(", ")}`);
  }

  const billingAction = SERVICE_TO_BILLING[service];
  if (!billingAction) {
    return apiError(`No pricing for service: ${service}`);
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

  // Verify source image exists
  const { data: sourceImage, error: imgError } = await supabase
    .from("property_media")
    .select("id, url, room_type, aistaging_asset_id")
    .eq("id", image_id)
    .eq("property_id", property_id)
    .single();

  if (imgError || !sourceImage) {
    return apiError("Image not found", 404);
  }

  // 1. Charge SimplerPay
  const priceCents = RETAIL_PRICES[billingAction];
  const idempotencyKey = makeIdempotencyKey(service, property_id, image_id);

  const billingResult = await reportUsage({
    user_email: user!.email!,
    action: billingAction,
    cost_cents: priceCents,
    idempotency_key: idempotencyKey,
    metadata: { property_id, image_id, service, options },
  });

  if (!billingResult.ok) {
    if (billingResult.status === 429) {
      return apiError("Spending cap exceeded. Please add funds to continue.", 429);
    }
    return apiError(`Billing failed: ${billingResult.error}`, 502);
  }

  console.log(`${LOG_PREFIX} Charged $${(priceCents / 100).toFixed(2)} for ${service}`);

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

  // 3. Find AiStaging asset ID
  if (!sourceImage.aistaging_asset_id) {
    return apiError("Image not yet synced to AI service. Please try again in a moment.", 409);
  }

  // 4. Call AiStaging
  const processResult = await processImage(
    aistagingProjectId,
    sourceImage.aistaging_asset_id,
    service as AIServiceType,
    options,
  );

  if (!processResult.ok) {
    console.error(`${LOG_PREFIX} AiStaging ${service} failed:`, processResult.error);
    return apiError(`AI processing failed: ${processResult.error}`, 502);
  }

  const { job_id, status, result_url, asset_id } = processResult.data;

  // 5. Insert property_media record
  const mediaType = SERVICE_TO_MEDIA_TYPE[service] || service;
  const mediaStatus = status === "completed" ? "completed" : "processing";

  const { data: newMedia } = await supabase
    .from("property_media")
    .insert({
      property_id,
      type: mediaType,
      url: result_url || sourceImage.url,
      room_type: sourceImage.room_type,
      ai_service: service,
      status: mediaStatus,
      source_image_id: image_id,
      aistaging_asset_id: asset_id || null,
      aistaging_job_id: job_id,
      billing_ref: idempotencyKey,
      cost_cents: priceCents,
    })
    .select("id")
    .single();

  console.log(`${LOG_PREFIX} Job ${job_id}: ${mediaStatus} (${service}) for property=${property_id}`);

  return NextResponse.json({
    job_id,
    media_id: newMedia?.id,
    status: mediaStatus,
    result_url: result_url || null,
    service,
  });
}
