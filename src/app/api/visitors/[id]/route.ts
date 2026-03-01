import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { z } from "zod";

const visitorUpdateSchema = z.object({
  contacted: z.boolean().optional(),
  priority: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

/** PATCH /api/visitors/[id] — Update visitor fields */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const parsed = visitorUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message);
  }

  const { data, error: dbError } = await supabase
    .from("visitors")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (dbError) return apiError(dbError.message, 500);
  return NextResponse.json({ visitor: data });
}
