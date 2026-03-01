import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { testZapierWebhook, isValidWebhookUrl } from "@/lib/integrations/zapier/client";

/**
 * POST /api/integrations/zapier/test
 * Test a Zapier webhook URL before saving.
 * Body: { webhook_url: string }
 */
export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  let body: { webhook_url?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON");
  }

  if (!body.webhook_url) {
    return apiError("webhook_url is required");
  }

  if (body.webhook_url.length > 2048) {
    return apiError("URL too long");
  }

  // Pre-validate URL format + SSRF
  const validation = isValidWebhookUrl(body.webhook_url);
  if (!validation.valid) {
    return NextResponse.json({ ok: false, error: validation.error });
  }

  const result = await testZapierWebhook(body.webhook_url);

  return NextResponse.json(result);
}
