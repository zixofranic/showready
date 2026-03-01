import { createServerSupabase } from "./supabase-server";
import { NextResponse } from "next/server";

/** Get authenticated user or return 401 response */
export async function requireAuth() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      supabase,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user, supabase, error: null };
}

/** Standard error response */
export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
