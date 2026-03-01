import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

/** POST /api/kiosk/[eventId]/verify-pin — Verify PIN to exit kiosk */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createServiceClient();

  const body = await request.json();
  const pin = body.pin;

  if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "Invalid PIN format" }, { status: 400 });
  }

  const { data: event, error } = await supabase
    .from("events")
    .select("kiosk_pin_hash")
    .eq("id", eventId)
    .single();

  if (error || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (!event.kiosk_pin_hash) {
    // No PIN set — allow exit
    return NextResponse.json({ valid: true });
  }

  // Hash the provided PIN and compare
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const pinHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  if (pinHash === event.kiosk_pin_hash) {
    return NextResponse.json({ valid: true });
  }

  return NextResponse.json({ valid: false, error: "Incorrect PIN" }, { status: 403 });
}
