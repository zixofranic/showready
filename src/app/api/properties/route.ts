import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { propertySchema } from "@/lib/validations";

export async function GET() {
  const { user, supabase, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false });

  if (dbError) return apiError(dbError.message, 500);
  return NextResponse.json({ properties: data });
}

export async function POST(request: NextRequest) {
  const { user, supabase, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const parsed = propertySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message);
  }

  const { listing_url, ...rest } = parsed.data;

  const { data, error: dbError } = await supabase
    .from("properties")
    .insert({
      ...rest,
      listing_url: listing_url || null,
      user_id: user!.id,
      photos: [],
    })
    .select()
    .single();

  if (dbError) return apiError(dbError.message, 500);
  return NextResponse.json({ property: data }, { status: 201 });
}
