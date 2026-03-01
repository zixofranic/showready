/**
 * Shared helpers for media API routes that call AiStaging.
 *
 * Common flow:
 * 1. requireAuth
 * 2. Validate input
 * 3. Charge SimplerPay
 * 4. Ensure AiStaging project exists (lazy creation)
 * 5. Call AiStaging API
 * 6. Insert pending property_media record
 * 7. Return job info
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureProject } from "@/lib/aistaging-client";
import { createServiceClient } from "@/lib/supabase-server";

const LOG_PREFIX = "[AiStaging Helper]";

/**
 * Get the webhook callback URL for AiStaging results.
 */
export function getCallbackUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_APP_URL not configured");
  const url = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
  return `${url}/api/webhooks/aistaging`;
}

/**
 * Ensure the property has an AiStaging project linked.
 * Creates one lazily if needed, imports original photos.
 */
export async function ensureAiStagingProject(
  property: {
    id: string;
    address: string;
    aistaging_project_id: string | null;
  },
  agentEmail: string,
  userSupabase: SupabaseClient,
): Promise<string> {
  // Already linked
  if (property.aistaging_project_id) {
    return property.aistaging_project_id;
  }

  const callbackUrl = getCallbackUrl();
  const serviceClient = await createServiceClient();

  // Get original photos for this property
  const { data: originals } = await serviceClient
    .from("property_media")
    .select("url, room_type")
    .eq("property_id", property.id)
    .eq("type", "original");

  const photos = (originals || []).map((p) => ({
    url: p.url,
    room_type: p.room_type || undefined,
  }));

  const result = await ensureProject(
    property.address,
    property.id,
    callbackUrl,
    agentEmail,
    photos,
  );

  if (!result.ok) {
    throw new Error(`AiStaging project creation failed: ${result.error}`);
  }

  const projectId = result.data.aistaging_project_id;

  // Save the link
  await serviceClient
    .from("properties")
    .update({ aistaging_project_id: projectId })
    .eq("id", property.id);

  console.log(
    `${LOG_PREFIX} Linked property ${property.id} → AiStaging project ${projectId}` +
      ` (${result.data.photos_imported} photos imported)`,
  );

  return projectId;
}

/**
 * Find the AiStaging asset ID for a ShowReady property_media record.
 * Original photos get their aistaging_asset_id when the project is created.
 */
export async function findAiStagingAssetId(
  propertyId: string,
  mediaId: string,
): Promise<string | null> {
  const supabase = await createServiceClient();

  const { data } = await supabase
    .from("property_media")
    .select("aistaging_asset_id")
    .eq("id", mediaId)
    .eq("property_id", propertyId)
    .single();

  return data?.aistaging_asset_id || null;
}
