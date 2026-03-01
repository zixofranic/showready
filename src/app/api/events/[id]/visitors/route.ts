import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";

/** GET /api/events/[id]/visitors — List visitors for an event */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const search = request.nextUrl.searchParams.get("search") || "";
  const sort = request.nextUrl.searchParams.get("sort") || "created_at";
  const order = request.nextUrl.searchParams.get("order") || "desc";
  const source = request.nextUrl.searchParams.get("source");
  const contacted = request.nextUrl.searchParams.get("contacted");
  const priority = request.nextUrl.searchParams.get("priority");

  let query = supabase
    .from("visitors")
    .select("*")
    .eq("event_id", id);

  if (source) query = query.eq("source", source);
  if (contacted === "true") query = query.eq("contacted", true);
  if (contacted === "false") query = query.eq("contacted", false);
  if (priority === "true") query = query.eq("priority", true);

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
    );
  }

  const validSorts = ["created_at", "first_name", "last_name", "email"];
  const sortCol = validSorts.includes(sort) ? sort : "created_at";
  query = query.order(sortCol, { ascending: order === "asc" });

  const { data, error: dbError } = await query;

  if (dbError) return apiError(dbError.message, 500);
  return NextResponse.json({ visitors: data });
}
