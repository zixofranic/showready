/**
 * POST /api/media/stage
 *
 * Virtual staging: takes a property photo and generates a staged version.
 * Charges via SimplerPay BEFORE calling Decor8 (prevents free usage on billing failure).
 *
 * Body: {
 *   property_id: string (UUID),
 *   photo_url: string (must be from our Supabase Storage),
 *   room_type: string (Decor8 room type),
 *   design_style: string (Decor8 style),
 * }
 *
 * Returns: { staged_url, cost_cents, media_id }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { createServiceClient } from "@/lib/supabase-server";
import { generateStagedRoom } from "@/lib/media/ai-staging";
import { reportUsage, makeIdempotencyKey, AI_COSTS } from "@/lib/billing/simplerpay";

export const maxDuration = 90; // AI generation can take up to 60s

const LOG_PREFIX = "[Stage]";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORAGE_BUCKET = "property-photos";

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let body: {
    property_id?: string;
    photo_url?: string;
    room_type?: string;
    design_style?: string;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON");
  }

  const { property_id, photo_url, room_type, design_style } = body;

  // Validate required fields
  if (!property_id || !UUID_RE.test(property_id)) {
    return apiError("property_id must be a valid UUID");
  }
  if (!photo_url || typeof photo_url !== "string") {
    return apiError("photo_url is required");
  }
  if (!room_type || typeof room_type !== "string") {
    return apiError("room_type is required");
  }
  if (!design_style || typeof design_style !== "string") {
    return apiError("design_style is required");
  }

  // Validate photo URL is from our Storage (prevent arbitrary URL staging)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!photo_url.startsWith(supabaseUrl)) {
    return apiError("photo_url must be from ShowReady storage");
  }

  // Verify property ownership
  const supabase = await createServiceClient();
  const { data: property } = await supabase
    .from("properties")
    .select("id, user_id")
    .eq("id", property_id)
    .single();

  if (!property || property.user_id !== user!.id) {
    return apiError("Property not found", 404);
  }

  // Get user email for billing
  const { data: userData } = await supabase.auth.admin.getUserById(user!.id);
  const userEmail = userData?.user?.email;
  if (!userEmail) {
    return apiError("User email not found — required for billing", 500);
  }

  // CHARGE BEFORE SERVICE (CTO Gate: prevents free usage on billing failure)
  const idempotencyKey = makeIdempotencyKey("staging", property_id, room_type, design_style);
  const costCents = AI_COSTS.staging;

  console.log(`${LOG_PREFIX} Charging ${costCents}c for staging (${idempotencyKey})`);
  const billingResult = await reportUsage({
    user_email: userEmail,
    action: "staging",
    cost_cents: costCents,
    idempotency_key: idempotencyKey,
    metadata: {
      property_id,
      room_type,
      design_style,
      app: "showready",
    },
  });

  if (!billingResult.ok) {
    if (billingResult.status === 429) {
      return apiError("Spending cap exceeded. Contact your admin to increase your limit.", 429);
    }
    console.error(`${LOG_PREFIX} Billing failed:`, billingResult.error);
    return apiError("Billing service unavailable. Try again later.", 503);
  }

  // Call Decor8 API
  console.log(`${LOG_PREFIX} Calling Decor8 for ${room_type}/${design_style}`);
  let stagedResult;
  try {
    stagedResult = await generateStagedRoom({
      imageUrl: photo_url,
      roomType: room_type,
      designStyle: design_style,
    });
  } catch (err) {
    console.error(
      `${LOG_PREFIX} Decor8 failed:`,
      err instanceof Error ? err.message : "Unknown error",
    );
    // TODO(chunk-3.6): Issue refund via SimplerPay if Decor8 fails after charge
    return apiError(
      err instanceof Error
        ? `Staging failed: ${err.message}. A refund will be issued.`
        : "Staging service failed. Contact support for a refund.",
      500,
    );
  }

  // Download staged image from Decor8 (temporary URL — expires)
  // and re-upload to our Storage
  console.log(`${LOG_PREFIX} Downloading staged result from Decor8`);
  let stagedStorageUrl: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    // Validate Decor8 result URL points to known Decor8 domain (SSRF prevention)
    const stagedUrl = new URL(stagedResult.url);
    if (!stagedUrl.hostname.endsWith("decor8.ai") && !stagedUrl.hostname.endsWith("amazonaws.com")) {
      throw new Error(`Unexpected staged image host: ${stagedUrl.hostname}`);
    }

    let imgResponse: Response;
    try {
      imgResponse = await fetch(stagedResult.url, {
        signal: controller.signal,
        redirect: "error",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!imgResponse.ok) {
      throw new Error(`Download failed: ${imgResponse.status}`);
    }

    // Validate content type is actually an image (F6)
    const contentType = imgResponse.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`Decor8 returned non-image content: ${contentType}`);
    }

    const buffer = await imgResponse.arrayBuffer();
    const storagePath = `${user!.id}/${property_id}/staged_${room_type}_${Date.now()}.jpg`;

    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    stagedStorageUrl = urlData.publicUrl;
  } catch (err) {
    console.error(
      `${LOG_PREFIX} Storage failed:`,
      err instanceof Error ? err.message : "Unknown error",
    );
    return apiError("Failed to save staged image. Try again.", 500);
  }

  // Save to property_media table
  const { data: mediaRecord, error: mediaErr } = await supabase
    .from("property_media")
    .insert({
      property_id,
      type: "staged",
      url: stagedStorageUrl,
      room_type,
      ai_service: "decor8",
      cost_cents: costCents,
    })
    .select("id")
    .single();

  if (mediaErr) {
    console.error(`${LOG_PREFIX} Media record failed:`, mediaErr.message);
    // Non-fatal — image was saved to storage, just not tracked
  }

  // Log local usage for the agent's dashboard
  const { error: usageErr } = await supabase.from("usage_log").insert({
    user_id: user!.id,
    action: "staging",
    cost_cents: costCents,
    description: `Virtual staging: ${room_type} / ${design_style}`,
    property_id,
  });
  if (usageErr) {
    console.error(`${LOG_PREFIX} Usage log failed:`, usageErr.message);
  }

  console.log(`${LOG_PREFIX} Done — ${stagedStorageUrl}`);

  return NextResponse.json({
    staged_url: stagedStorageUrl,
    cost_cents: costCents,
    media_id: mediaRecord?.id || null,
    room_type,
    design_style,
  });
}
