/**
 * Media Storage Helper
 *
 * Downloads photos from external CDN URLs and uploads them to
 * ShowReady's Supabase Storage bucket.
 *
 * Photos are stored in user-scoped paths:
 *   property-photos/{user_id}/{property_id}/{filename}
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase-server";

const BUCKET = "property-photos";
const MAX_PHOTO_SIZE = 15 * 1024 * 1024; // 15MB
const DOWNLOAD_TIMEOUT = 15_000; // 15s per photo

// Allowlisted CDN domains for MLS photo downloads (SSRF prevention)
const ALLOWED_PHOTO_HOSTS = [
  "photos.sparkplatform.com",
  "media.sparkplatform.com",
  "cdn.sparkplatform.com",
  "resize.sparkplatform.com",
  "photos.flexmls.com",
  "media.flexmls.com",
  "sparkplatform.com",
  "flexmls.com",
];

/** Validate that a photo URL points to a known MLS CDN domain. */
function isAllowedPhotoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_PHOTO_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

interface UploadResult {
  url: string;
  path: string;
  contentType: string;
}

/**
 * Download a photo from an external URL and upload to Supabase Storage.
 * Returns the public URL and storage path.
 */
export async function downloadAndUpload(
  externalUrl: string,
  userId: string,
  propertyId: string,
  filename: string,
  supabase: SupabaseClient,
): Promise<UploadResult> {
  // Validate URL against allowlist (SSRF prevention)
  if (!isAllowedPhotoUrl(externalUrl)) {
    throw new Error(`Blocked: photo URL host not in allowlist`);
  }

  // Download from CDN
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

  let response: Response;
  try {
    response = await fetch(externalUrl, {
      signal: controller.signal,
      redirect: "error", // Don't follow redirects to prevent SSRF
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  // Check content type
  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Unexpected content type: ${contentType}`);
  }

  // Check size
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_PHOTO_SIZE) {
    throw new Error(`Photo too large: ${contentLength} bytes`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_PHOTO_SIZE) {
    throw new Error(`Photo too large: ${buffer.byteLength} bytes`);
  }

  // Upload to Supabase Storage
  const storagePath = `${userId}/${propertyId}/${filename}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return {
    url: urlData.publicUrl,
    path: storagePath,
    contentType,
  };
}

/**
 * Upload multiple MLS photos to storage.
 * Returns results for each photo (some may fail — partial success is OK).
 */
export async function uploadMLSPhotos(
  photos: Array<{ url: string; caption: string; room_type: string | null }>,
  userId: string,
  propertyId: string,
): Promise<{
  uploaded: Array<{
    url: string;
    path: string;
    caption: string;
    room_type: string | null;
    index: number;
  }>;
  failed: Array<{ index: number; error: string }>;
}> {
  const uploaded: Array<{
    url: string;
    path: string;
    caption: string;
    room_type: string | null;
    index: number;
  }> = [];
  const failed: Array<{ index: number; error: string }> = [];

  // Create ONE service client for all uploads (not per-photo)
  const supabase = await createServiceClient();

  // Process in batches of 5 to avoid overwhelming the CDN
  const BATCH_SIZE = 5;
  for (let i = 0; i < photos.length; i += BATCH_SIZE) {
    const batch = photos.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (photo, batchIdx) => {
        const idx = i + batchIdx;
        // Use .jpg default — Supabase Storage serves by content-type, not extension
        const filename = `mls_${String(idx).padStart(3, "0")}.jpg`;

        const result = await downloadAndUpload(
          photo.url,
          userId,
          propertyId,
          filename,
          supabase,
        );

        return {
          url: result.url,
          path: result.path,
          caption: photo.caption,
          room_type: photo.room_type,
          index: idx,
        };
      }),
    );

    for (const [batchIdx, result] of results.entries()) {
      const idx = i + batchIdx;
      if (result.status === "fulfilled") {
        uploaded.push(result.value);
      } else {
        failed.push({
          index: idx,
          error: result.reason instanceof Error
            ? result.reason.message
            : "Unknown error",
        });
      }
    }
  }

  return { uploaded, failed };
}
