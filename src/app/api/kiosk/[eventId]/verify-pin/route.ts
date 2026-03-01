import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/** POST /api/kiosk/[eventId]/verify-pin — Verify PIN to exit kiosk */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  // Rate limit: 5 attempts per minute per IP (brute-force protection)
  const ip = getClientIp(request);
  const limited = checkRateLimit(`pin:${ip}:${eventId}`, 5, 60_000);
  if (limited) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment." },
      { status: 429 },
    );
  }

  let body: { pin?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const pin = body.pin;

  if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "Invalid PIN format" }, { status: 400 });
  }

  const supabase = await createServiceClient();

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
