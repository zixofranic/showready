import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { createServiceClient } from "@/lib/supabase-server";

/**
 * GET /api/integrations/settings
 * Get settings for all active integrations.
 * Returns: { [integration]: { push_visitors, create_todos, log_timeline } }
 */
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("integration_credentials")
    .select("integration, settings")
    .eq("user_id", user!.id)
    .eq("is_active", true);

  const result: Record<string, Record<string, boolean>> = {};
  for (const row of data || []) {
    result[row.integration] = {
      push_visitors: (row.settings as Record<string, boolean>)?.push_visitors !== false, // default ON
      create_todos: (row.settings as Record<string, boolean>)?.create_todos !== false,   // default ON
      log_timeline: (row.settings as Record<string, boolean>)?.log_timeline !== false,   // default ON
    };
  }

  return NextResponse.json(result);
}

/**
 * PATCH /api/integrations/settings
 * Update settings for a specific integration.
 * Body: { integration: string, settings: { push_visitors?, create_todos?, log_timeline? } }
 */
export async function PATCH(request: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let body: { integration?: string; settings?: Record<string, boolean> };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON");
  }

  if (!body.integration || !body.settings) {
    return apiError("integration and settings are required");
  }

  const validIntegrations = ["cloze", "fub", "zapier"];
  if (!validIntegrations.includes(body.integration)) {
    return apiError("Invalid integration name");
  }

  const validKeys = ["push_visitors", "create_todos", "log_timeline"];
  const sanitized: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(body.settings)) {
    if (validKeys.includes(key) && typeof val === "boolean") {
      sanitized[key] = val;
    }
  }

  const supabase = await createServiceClient();

  // Read current settings, merge, write back
  const { data: existing } = await supabase
    .from("integration_credentials")
    .select("settings")
    .eq("user_id", user!.id)
    .eq("integration", body.integration)
    .eq("is_active", true)
    .single();

  if (!existing) {
    return apiError("Integration not connected", 404);
  }

  const current = (existing.settings as Record<string, boolean>) || {};
  const merged = { ...current, ...sanitized };

  await supabase
    .from("integration_credentials")
    .update({ settings: merged, updated_at: new Date().toISOString() })
    .eq("user_id", user!.id)
    .eq("integration", body.integration);

  return NextResponse.json({ ok: true, settings: merged });
}
