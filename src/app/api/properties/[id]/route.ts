import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { propertySchema } from "@/lib/validations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .single();

  if (dbError) return apiError("Property not found", 404);
  return NextResponse.json({ property: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const parsed = propertySchema.partial().safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message);
  }

  const { listing_url, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };
  if (listing_url !== undefined) {
    updateData.listing_url = listing_url || null;
  }

  const { data, error: dbError } = await supabase
    .from("properties")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (dbError) return apiError(dbError.message, 500);
  return NextResponse.json({ property: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { error: dbError } = await supabase
    .from("properties")
    .delete()
    .eq("id", id);

  if (dbError) return apiError(dbError.message, 500);
  return NextResponse.json({ ok: true });
}
