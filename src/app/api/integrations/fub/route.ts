import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import {
  loadFUBCredentials,
  saveFUBCredentials,
  deleteFUBCredentials,
} from "@/lib/integrations/fub/client";

/**
 * GET /api/integrations/fub
 * Get current FUB integration status (no secrets exposed)
 */
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const creds = await loadFUBCredentials(user!.id);
  return NextResponse.json({ connected: !!creds });
}

/**
 * POST /api/integrations/fub
 * Save API key credentials.
 * Body: { api_key: string }
 */
export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let body: { api_key?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON");
  }

  if (!body.api_key) {
    return apiError("api_key is required");
  }

  if (body.api_key.length > 200) {
    return apiError("Invalid input length");
  }

  await saveFUBCredentials(user!.id, body.api_key);

  return NextResponse.json({ connected: true });
}

/**
 * DELETE /api/integrations/fub
 * Disconnect FUB integration
 */
export async function DELETE() {
  const { user, error } = await requireAuth();
  if (error) return error;

  await deleteFUBCredentials(user!.id);

  return NextResponse.json({ connected: false });
}
