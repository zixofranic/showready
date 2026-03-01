/**
 * POST /api/media/mls-import
 *
 * Accepts a FlexMLS share URL, calls Railway API to scrape it,
 * then imports photos to Supabase Storage and creates/updates
 * the property record.
 *
 * Body: { share_url: string, property_id?: string }
 *   - share_url: FlexMLS share link
 *   - property_id: existing property to update (optional — creates new if omitted)
 *
 * Returns: { property, photos_uploaded, photos_failed }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { createServiceClient } from "@/lib/supabase-server";
import {
  isValidMLSUrl,
  parseAddressFromSlug,
  processRailwayResponse,
} from "@/lib/media/mls-parser";
import { uploadMLSPhotos } from "@/lib/media/storage";

export const maxDuration = 60;

const LOG_PREFIX = "[MLS Import]";

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let body: { share_url?: string; property_id?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON");
  }

  const { share_url, property_id } = body;

  if (!share_url || typeof share_url !== "string") {
    return apiError("share_url is required");
  }

  // Validate URL is a known MLS domain (SSRF prevention)
  const urlCheck = isValidMLSUrl(share_url);
  if (!urlCheck.valid) {
    return apiError(urlCheck.error || "Invalid MLS URL");
  }

  // Validate property_id if provided (UUID format)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (property_id && !UUID_RE.test(property_id)) {
    return apiError("property_id must be a valid UUID");
  }

  // Parse address from URL slug (always works, no API needed)
  let inputSlug = "";
  try {
    inputSlug = new URL(share_url).pathname.split("/").pop() || "";
  } catch {
    return apiError("Could not parse URL");
  }
  const slugParsed = parseAddressFromSlug(inputSlug);

  // Call Railway API for full scraping
  const railwayUrl = process.env.PROPERTY_SYNC_API_URL;
  const railwayKey = process.env.PROPERTY_SYNC_API_KEY;

  if (!railwayUrl || !railwayKey) {
    return apiError(
      "MLS import service is not configured. Contact admin.",
      503,
    );
  }

  let parseResult;
  try {
    console.log(`${LOG_PREFIX} Calling Railway API for: ${share_url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    let res: Response;
    try {
      const baseUrl = railwayUrl.replace(/\/+$/, "");
      res = await fetch(`${baseUrl}/api/v1/mls/propiq-parse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": railwayKey,
        },
        body: JSON.stringify({
          shareUrl: share_url,
          width: 1920,
          height: 1280,
          maxPhotos: 50,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await res.json();

    if (!data.success || !data.rawFields) {
      console.error(`${LOG_PREFIX} Railway parse failed:`, data.error);
      return apiError(
        data.error || "MLS service could not parse this link. Try a different share URL.",
        422,
      );
    }

    console.log(
      `${LOG_PREFIX} Railway: ${Object.keys(data.rawFields).length} fields, ${(data.photos || []).length} photos`,
    );

    parseResult = processRailwayResponse(
      data.rawFields,
      data.photos || [],
      slugParsed,
    );
  } catch (err) {
    console.error(
      `${LOG_PREFIX} Railway API error:`,
      err instanceof Error ? err.message : "Unknown error",
    );
    return apiError("MLS import service is temporarily unavailable. Try again.", 503);
  }

  const { property: parsedProperty, photos: parsedPhotos } = parseResult;

  // Require at least an address
  if (!parsedProperty.address && !slugParsed.address) {
    return apiError(
      "Could not extract property address from MLS link. Try a different share URL.",
      422,
    );
  }

  const supabase = await createServiceClient();

  // Create or update property
  let propertyId: string;

  if (property_id) {
    // Verify ownership
    const { data: existing } = await supabase
      .from("properties")
      .select("id, user_id")
      .eq("id", property_id)
      .single();

    if (!existing || existing.user_id !== user!.id) {
      return apiError("Property not found", 404);
    }

    // Update with MLS data
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      listing_url: share_url,
    };
    if (parsedProperty.address) updateData.address = parsedProperty.address;
    if (parsedProperty.city) updateData.city = parsedProperty.city;
    if (parsedProperty.state) updateData.state = parsedProperty.state;
    if (parsedProperty.zip) updateData.zip = parsedProperty.zip;
    if (parsedProperty.beds !== null) updateData.beds = parsedProperty.beds;
    if (parsedProperty.baths !== null) updateData.baths = parsedProperty.baths;
    if (parsedProperty.sqft !== null) updateData.sqft = parsedProperty.sqft;
    if (parsedProperty.price !== null) updateData.price = parsedProperty.price;
    if (parsedProperty.mls_number) updateData.mls_number = parsedProperty.mls_number;

    await supabase.from("properties").update(updateData).eq("id", property_id);
    propertyId = property_id;
  } else {
    // Create new property
    const { data: newProp, error: createErr } = await supabase
      .from("properties")
      .insert({
        user_id: user!.id,
        address: parsedProperty.address || slugParsed.address || "Unknown Address",
        city: parsedProperty.city || slugParsed.city,
        state: parsedProperty.state || slugParsed.state,
        zip: parsedProperty.zip || slugParsed.zip,
        beds: parsedProperty.beds,
        baths: parsedProperty.baths,
        sqft: parsedProperty.sqft,
        price: parsedProperty.price,
        mls_number: parsedProperty.mls_number,
        listing_url: share_url,
        photos: [],
      })
      .select("id")
      .single();

    if (createErr || !newProp) {
      console.error(`${LOG_PREFIX} Property create failed:`, createErr?.message);
      return apiError("Failed to create property", 500);
    }

    propertyId = newProp.id;
  }

  // Upload photos to Supabase Storage
  let uploadResult = { uploaded: [] as Array<{
    url: string;
    path: string;
    caption: string;
    room_type: string | null;
    index: number;
  }>, failed: [] as Array<{ index: number; error: string }> };

  if (parsedPhotos.length > 0) {
    try {
      uploadResult = await uploadMLSPhotos(
        parsedPhotos.map((p) => ({
          url: p.url,
          caption: p.caption,
          room_type: p.room_type,
        })),
        user!.id,
        propertyId,
      );

      console.log(
        `${LOG_PREFIX} Photos: ${uploadResult.uploaded.length} uploaded, ${uploadResult.failed.length} failed`,
      );

      // Update property.photos JSONB with uploaded photo data
      if (uploadResult.uploaded.length > 0) {
        const photosJson = uploadResult.uploaded.map((p) => ({
          url: p.url,
          caption: p.caption,
          room_type: p.room_type,
          is_staged: false,
        }));

        await supabase
          .from("properties")
          .update({ photos: photosJson, updated_at: new Date().toISOString() })
          .eq("id", propertyId);
      }

      // Insert into property_media table for each uploaded photo
      if (uploadResult.uploaded.length > 0) {
        await supabase.from("property_media").insert(
          uploadResult.uploaded.map((p) => ({
            property_id: propertyId,
            type: "original",
            url: p.url,
            room_type: p.room_type,
            ai_service: null,
            cost_cents: 0,
          })),
        );
      }
    } catch (err) {
      console.error(
        `${LOG_PREFIX} Photo upload error:`,
        err instanceof Error ? err.message : "Unknown error",
      );
      // Don't fail the whole import — property was created, photos partially uploaded
    }
  }

  // Fetch the final property record
  const { data: finalProperty } = await supabase
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .single();

  return NextResponse.json({
    property: finalProperty,
    photos_uploaded: uploadResult.uploaded.length,
    photos_failed: uploadResult.failed.length,
    mls_data: {
      address: parsedProperty.address,
      beds: parsedProperty.beds,
      baths: parsedProperty.baths,
      sqft: parsedProperty.sqft,
      price: parsedProperty.price,
      mls_number: parsedProperty.mls_number,
      total_photos_found: parsedPhotos.length,
    },
  });
}
