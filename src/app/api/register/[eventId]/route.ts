import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { visitorSchema } from "@/lib/validations";

/** GET /api/register/[eventId] — Public event info for QR registration */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createServiceClient();

  const { data: event, error } = await supabase
    .from("events")
    .select(
      "id, name, event_date, start_time, end_time, status, custom_questions, welcome_message, thank_you_message, branding, property:properties(address, city, state, photos)",
    )
    .eq("id", eventId)
    .single();

  if (error || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.status !== "live") {
    return NextResponse.json(
      { error: "This event is not currently accepting registrations", status: event.status },
      { status: 403 },
    );
  }

  return NextResponse.json({ event });
}

/** POST /api/register/[eventId] — Register visitor via QR code */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createServiceClient();

  // Verify event exists and is live
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, user_id, status")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.status !== "live") {
    return NextResponse.json(
      { error: "This event is not currently accepting registrations" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const parsed = visitorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  // Honeypot check — if `website` field is filled, it's a bot
  if (body.website) {
    // Silently accept but don't insert
    return NextResponse.json({ visitor: { id: "ok", first_name: parsed.data.first_name } }, { status: 201 });
  }

  const { data: visitor, error: insertError } = await supabase
    .from("visitors")
    .insert({
      event_id: eventId,
      user_id: event.user_id,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      answers: parsed.data.answers || {},
      source: "qr",
      notes: parsed.data.notes || null,
    })
    .select("id, first_name")
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to register. Please try again." },
      { status: 500 },
    );
  }

  // Increment visitor count
  await supabase.rpc("increment_visitor_count", { event_id: eventId });

  return NextResponse.json({ visitor }, { status: 201 });
}
