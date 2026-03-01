import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { testFUBConnection } from "@/lib/integrations/fub/client";

/**
 * POST /api/integrations/fub/test
 * Test a FUB API key before saving.
 * Body: { api_key: string }
 */
export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
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

  const result = await testFUBConnection(body.api_key);

  return NextResponse.json(result);
}
