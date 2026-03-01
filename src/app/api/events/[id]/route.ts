import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { eventSchema } from "@/lib/validations";
import { z } from "zod";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("events")
    .select("*, property:properties(*)")
    .eq("id", id)
    .single();

  if (dbError) return apiError("Event not found", 404);
  return NextResponse.json({ event: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();

  // Allow status updates separately
  const statusSchema = z.object({ status: z.enum(["upcoming", "live", "completed"]) });
  const statusParsed = statusSchema.safeParse(body);

  if (statusParsed.success && Object.keys(body).length === 1) {
    const { data, error: dbError } = await supabase
      .from("events")
      .update({ status: statusParsed.data.status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, property:properties(*)")
      .single();

    if (dbError) return apiError(dbError.message, 500);
    return NextResponse.json({ event: data });
  }

  // Full update
  const parsed = eventSchema.partial().safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message);
  }

  const { kiosk_pin, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };

  if (kiosk_pin !== undefined) {
    if (kiosk_pin) {
      const encoder = new TextEncoder();
      const d = encoder.encode(kiosk_pin);
      const hashBuffer = await crypto.subtle.digest("SHA-256", d);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      updateData.kiosk_pin_hash = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } else {
      updateData.kiosk_pin_hash = null;
    }
  }

  const { data, error: dbError } = await supabase
    .from("events")
    .update(updateData)
    .eq("id", id)
    .select("*, property:properties(*)")
    .single();

  if (dbError) return apiError(dbError.message, 500);
  return NextResponse.json({ event: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { error: dbError } = await supabase.from("events").delete().eq("id", id);

  if (dbError) return apiError(dbError.message, 500);
  return NextResponse.json({ ok: true });
}
