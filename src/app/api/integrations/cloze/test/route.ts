import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { testRawApiKey } from "@/lib/integrations/cloze/client";

/**
 * POST /api/integrations/cloze/test
 * Test a Cloze API key before saving.
 * Body: { email: string, api_key: string }
 */
export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
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

  const result = await testRawApiKey(body.email, body.api_key);

  return NextResponse.json(result);
}
