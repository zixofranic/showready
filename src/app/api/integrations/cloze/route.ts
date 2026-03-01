import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import {
  loadCredentials,
  saveCredentials,
  deleteCredentials,
  testConnection,
} from "@/lib/integrations/cloze/client";
import { ClozeStoredCredentials } from "@/lib/integrations/cloze/types";

/**
 * GET /api/integrations/cloze
 * Get current Cloze integration status (no secrets exposed)
 */
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const creds = await loadCredentials(user!.id);
  if (!creds) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    auth_type: creds.auth_type,
    email: creds.user_email || null,
    // Don't expose tokens or api_key
  });
}

/**
 * POST /api/integrations/cloze
 * Save API key credentials (OAuth is saved via callback route)
 * Body: { email: string, api_key: string }
 */
export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let body: { email?: string; api_key?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON");
  }

  if (!body.email || !body.api_key) {
    return apiError("email and api_key are required");
  }

  if (body.email.length > 254 || body.api_key.length > 200) {
    return apiError("Invalid input length");
  }

  const creds: ClozeStoredCredentials = {
    auth_type: "api_key",
    api_key: body.api_key,
    user_email: body.email,
  };

  await saveCredentials(user!.id, creds, body.email);

  // Verify connection works
  const testResult = await testConnection(user!.id);
  if (!testResult.ok) {
    // Roll back — deactivate the bad credentials
    await deleteCredentials(user!.id);
    return apiError(`Connection test failed: ${testResult.error}`, 422);
  }

  return NextResponse.json({
    connected: true,
    auth_type: "api_key",
    email: testResult.email || body.email,
  });
}

/**
 * DELETE /api/integrations/cloze
 * Disconnect Cloze integration
 */
export async function DELETE() {
  const { user, error } = await requireAuth();
  if (error) return error;

  await deleteCredentials(user!.id);

  return NextResponse.json({ connected: false });
}
