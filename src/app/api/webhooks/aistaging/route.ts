/**
 * POST /api/webhooks/aistaging
 *
 * Receives results from AiStaging after AI processing completes.
 * Updates property_media with result URL and status.
 * Auto-refunds via SimplerPay if processing failed.
 *
 * Auth: x-api-key header (CROSS_APP_API_KEY)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { refundUsage } from "@/lib/billing/simplerpay";

const LOG_PREFIX = "[Webhook:AiStaging]";

interface WebhookResult {
  url: string;
  asset_id: string;
  room_type?: string;
  style?: string;
  duration_seconds?: number;
}

interface WebhookPayload {
  showready_property_id: string;
  job_id: string;
  service: string;
  results?: WebhookResult[];
  error?: string;
}

function validateApiKey(request: NextRequest): boolean {
  const key = request.headers.get("x-api-key");
  return key === process.env.CROSS_APP_API_KEY;
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { showready_property_id, job_id, service, results, error: processingError } = payload;

  if (!showready_property_id || !job_id || !service) {
    return NextResponse.json(
      { error: "Missing required fields: showready_property_id, job_id, service" },
      { status: 400 },
    );
  }

  console.log(
    `${LOG_PREFIX} Received ${service} result for property=${showready_property_id}, job=${job_id}`,
  );

  const supabase = await createServiceClient();

  // Find the property
  const { data: property, error: propError } = await supabase
    .from("properties")
    .select("id")
    .eq("id", showready_property_id)
    .single();

  if (propError || !property) {
    console.error(`${LOG_PREFIX} Property not found: ${showready_property_id}`);
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  // Find the pending/processing media record for this job
  const { data: mediaRecord } = await supabase
    .from("property_media")
    .select("id, billing_ref, source_image_id")
    .eq("property_id", showready_property_id)
    .eq("aistaging_job_id", job_id)
    .in("status", ["pending", "processing"])
    .single();

  // Handle failure — auto-refund
  if (processingError || !results || results.length === 0) {
    console.error(`${LOG_PREFIX} Processing failed for job=${job_id}: ${processingError}`);

    if (mediaRecord) {
      // Update status to failed
      await supabase
        .from("property_media")
        .update({ status: "failed" })
        .eq("id", mediaRecord.id);

      // Auto-refund via SimplerPay
      if (mediaRecord.billing_ref) {
        try {
          const refundResult = await refundUsage(
            mediaRecord.billing_ref,
            `AiStaging processing failed: ${processingError || "no results"}`,
          );
          if (refundResult.ok) {
            console.log(`${LOG_PREFIX} Auto-refund successful for billing_ref=${mediaRecord.billing_ref}`);
          } else {
            console.error(`${LOG_PREFIX} Auto-refund failed:`, refundResult.error);
          }
        } catch (err) {
          console.error(`${LOG_PREFIX} Auto-refund error:`, err);
        }
      }
    }

    return NextResponse.json({ received: true, status: "failed" });
  }

  // Handle success — update media record
  const result = results[0]; // Primary result

  if (mediaRecord) {
    // Update existing record with result
    await supabase
      .from("property_media")
      .update({
        url: result.url,
        status: "completed",
        aistaging_asset_id: result.asset_id,
        style: result.style || null,
        room_type: result.room_type || null,
      })
      .eq("id", mediaRecord.id);
  } else {
    // No pending record found — create one (webhook arrived before our DB write, or was a retry)
    const mediaType = service === "sky_lighting" ? "sky" : service;
    await supabase.from("property_media").insert({
      property_id: showready_property_id,
      type: mediaType,
      url: result.url,
      room_type: result.room_type || null,
      ai_service: service,
      style: result.style || null,
      status: "completed",
      aistaging_asset_id: result.asset_id,
      aistaging_job_id: job_id,
      cost_cents: 0, // Already charged via SimplerPay
    });
  }

  console.log(`${LOG_PREFIX} Saved result for job=${job_id}, url=${result.url}`);

  return NextResponse.json({ received: true, status: "completed" });
}
