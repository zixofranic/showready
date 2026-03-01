/**
 * GET /api/media/[propertyId]
 *
 * List all media for a property (originals + AI-processed).
 * Groups results by source image for before/after display.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("property_media")
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: true });

  if (dbError) return apiError(dbError.message, 500);

  return NextResponse.json({ media: data || [] });
}
