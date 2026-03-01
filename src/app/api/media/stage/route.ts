/**
 * POST /api/media/stage
 *
 * Stage a property photo with AI virtual staging.
 *
 * Flow: requireAuth → validate → SimplerPay charge → AiStaging → pending record → return
 *
 * Body: { property_id, image_id, room_type?, design_style? }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { createServiceClient } from "@/lib/supabase-server";
import { reportUsage, makeIdempotencyKey, RETAIL_PRICES } from "@/lib/billing/simplerpay";
import { processImage } from "@/lib/aistaging-client";
import { ensureAiStagingProject } from "@/lib/media/aistaging-helpers";

export const maxDuration = 60;

const LOG_PREFIX = "[Stage]";

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let body: { property_id?: string; image_id?: string; room_type?: string; design_style?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON");
  }

  const { property_id, image_id, room_type, design_style } = body;

  if (!property_id || !image_id) {
    return apiError("property_id and image_id are required");
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
    .select("id, url, room_type, type")
    .eq("id", image_id)
    .eq("property_id", property_id)
    .single();

  if (imgError || !sourceImage) {
    return apiError("Image not found", 404);
  }

  // 1. Charge SimplerPay
  const idempotencyKey = makeIdempotencyKey("staging", property_id, image_id);

  const billingResult = await reportUsage({
    user_email: user!.email!,
    action: "staging",
    cost_cents: RETAIL_PRICES.staging,
    idempotency_key: idempotencyKey,
    metadata: { property_id, image_id, room_type, design_style },
  });

  if (!billingResult.ok) {
    if (billingResult.status === 429) {
      return apiError("Spending cap exceeded. Please add funds to continue.", 429);
    }
    return apiError(`Billing failed: ${billingResult.error}`, 502);
  }

  console.log(`${LOG_PREFIX} Charged $${(RETAIL_PRICES.staging / 100).toFixed(2)} for staging`);

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

  // 3. Find AiStaging asset ID for this image
  const { data: mediaWithAsset } = await supabase
    .from("property_media")
    .select("aistaging_asset_id")
    .eq("id", image_id)
    .single();

  const aistagingAssetId = mediaWithAsset?.aistaging_asset_id;

  if (!aistagingAssetId) {
    return apiError("Image not yet synced to AI service. Please try again in a moment.", 409);
  }

  // 4. Call AiStaging
  const processResult = await processImage(aistagingProjectId, aistagingAssetId, "staging", {
    room_type: room_type || sourceImage.room_type || "living_room",
    design_style: design_style || "modern",
  });

  if (!processResult.ok) {
    console.error(`${LOG_PREFIX} AiStaging process failed:`, processResult.error);
    return apiError(`AI processing failed: ${processResult.error}`, 502);
  }

  const { job_id, status, result_url, asset_id } = processResult.data;

  // 5. Insert property_media record
  const mediaStatus = status === "completed" ? "completed" : "processing";
  const { data: newMedia, error: insertError } = await supabase
    .from("property_media")
    .insert({
      property_id,
      type: "staged",
      url: result_url || sourceImage.url, // Use source URL as placeholder until webhook delivers result
      room_type: room_type || sourceImage.room_type,
      ai_service: "staging",
      style: design_style || "modern",
      status: mediaStatus,
      source_image_id: image_id,
      aistaging_asset_id: asset_id || null,
      aistaging_job_id: job_id,
      billing_ref: idempotencyKey,
      cost_cents: RETAIL_PRICES.staging,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error(`${LOG_PREFIX} Media insert failed:`, insertError.message);
  }

  console.log(
    `${LOG_PREFIX} Job ${job_id}: ${mediaStatus} for property=${property_id}`,
  );

  return NextResponse.json({
    job_id,
    media_id: newMedia?.id,
    status: mediaStatus,
    result_url: result_url || null,
  });
}
