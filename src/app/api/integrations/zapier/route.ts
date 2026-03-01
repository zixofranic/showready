import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import {
  loadZapierCredentials,
  saveZapierCredentials,
  deleteZapierCredentials,
  isValidWebhookUrl,
} from "@/lib/integrations/zapier/client";

/**
 * GET /api/integrations/zapier
 * Get current Zapier integration status (no secrets exposed)
 */
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const creds = await loadZapierCredentials(user!.id);
  return NextResponse.json({
    connected: !!creds,
    // Show masked URL for UX — never full URL
    webhook_url_preview: creds
      ? creds.webhook_url.slice(0, 40) + "..."
      : null,
  });
}

/**
 * POST /api/integrations/zapier
 * Save webhook URL.
 * Body: { webhook_url: string }
 */
export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth();
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

  // Validate URL (SSRF protection)
  const validation = isValidWebhookUrl(body.webhook_url);
  if (!validation.valid) {
    return apiError(validation.error || "Invalid webhook URL");
  }

  await saveZapierCredentials(user!.id, body.webhook_url);

  return NextResponse.json({
    connected: true,
    webhook_url_preview: body.webhook_url.slice(0, 40) + "...",
  });
}

/**
 * DELETE /api/integrations/zapier
 * Disconnect Zapier integration
 */
export async function DELETE() {
  const { user, error } = await requireAuth();
  if (error) return error;

  await deleteZapierCredentials(user!.id);

  return NextResponse.json({ connected: false });
}
