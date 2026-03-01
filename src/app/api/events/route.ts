import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { eventSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const status = request.nextUrl.searchParams.get("status");

  let query = supabase
    .from("events")
    .select("*, property:properties(*)")
    .order("event_date", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error: dbError } = await query;

  if (dbError) return apiError(dbError.message, 500);
  return NextResponse.json({ events: data });
}

export async function POST(request: NextRequest) {
  const { user, supabase, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message);
  }

  const { kiosk_pin, ...rest } = parsed.data;

  // Hash kiosk PIN if provided
  let kiosk_pin_hash: string | null = null;
  if (kiosk_pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(kiosk_pin);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    kiosk_pin_hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const { data: event, error: dbError } = await supabase
    .from("events")
    .insert({
      ...rest,
      custom_questions: rest.custom_questions ?? [],
      kiosk_pin_hash,
      user_id: user!.id,
      status: "upcoming",
      visitor_count: 0,
    })
    .select("*, property:properties(*)")
    .single();

  if (dbError) return apiError(dbError.message, 500);
  return NextResponse.json({ event }, { status: 201 });
}
