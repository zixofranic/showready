/**
 * Zapier Webhook Client
 *
 * Posts visitor data to a configurable webhook URL.
 * SSRF protection: HTTPS only, block private/local IPs.
 */

import { ZapierWebhookPayload, ZapierStoredCredentials } from "./types";
import { encrypt, decrypt } from "../../crypto";
import { createServiceClient } from "../../supabase-server";

// ── SSRF protection ──

const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
  "metadata.google.internal.", // trailing dot variant
  "169.254.169.254", // AWS/GCP metadata
  "[::ffff:127.0.0.1]",
  "[::ffff:169.254.169.254]",
];

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^fc00:/i,
  /^fd/i,
  /^fe80:/i,
];

export function isValidWebhookUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, error: "Only HTTPS URLs are allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTS.includes(hostname)) {
    return { valid: false, error: "URL points to a blocked host" };
  }

  for (const range of PRIVATE_IP_RANGES) {
    if (range.test(hostname)) {
      return { valid: false, error: "URL points to a private IP range" };
    }
  }

  // Block numeric/octal/hex IP representations
  if (/^\d+$/.test(hostname)) {
    return { valid: false, error: "Numeric IP addresses are not allowed" };
  }
  if (/^0[xX]/.test(hostname) || /^0\d/.test(hostname)) {
    return { valid: false, error: "Non-standard IP formats are not allowed" };
  }

  // Block IPv6-mapped IPv4
  if (hostname.includes("::ffff:")) {
    return { valid: false, error: "IPv6-mapped addresses are not allowed" };
  }

  // Block URLs with auth credentials
  if (parsed.username || parsed.password) {
    return { valid: false, error: "URL must not contain credentials" };
  }

  return { valid: true };
}

// ── Credential helpers ──

export async function loadZapierCredentials(
  userId: string,
): Promise<ZapierStoredCredentials | null> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("integration_credentials")
    .select("credentials_encrypted")
    .eq("user_id", userId)
    .eq("integration", "zapier")
    .eq("is_active", true)
    .single();

  if (!data) return null;

  try {
    return JSON.parse(decrypt(data.credentials_encrypted));
  } catch (err) {
    console.error(
      `[Zapier] Failed to decrypt credentials for user ${userId}:`,
      err instanceof Error ? err.message : "Unknown error",
    );
    return null;
  }
}

export async function saveZapierCredentials(
  userId: string,
  webhookUrl: string,
): Promise<void> {
  const supabase = await createServiceClient();
  const creds: ZapierStoredCredentials = {
    auth_type: "api_key",
    webhook_url: webhookUrl,
  };
  const encrypted = encrypt(JSON.stringify(creds));

  await supabase.from("integration_credentials").upsert(
    {
      user_id: userId,
      integration: "zapier",
      auth_type: "api_key",
      credentials_encrypted: encrypted,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,integration" },
  );
}

export async function deleteZapierCredentials(userId: string): Promise<void> {
  const supabase = await createServiceClient();
  await supabase
    .from("integration_credentials")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("integration", "zapier");
}

// ── Webhook caller ──

/** Post visitor data to the configured webhook URL */
export async function pushZapierWebhook(
  userId: string,
  payload: ZapierWebhookPayload,
): Promise<{ ok: boolean; error?: string }> {
  const creds = await loadZapierCredentials(userId);
  if (!creds) return { ok: false, error: "No Zapier webhook configured" };

  // Re-validate URL at push time (defense in depth)
  const validation = isValidWebhookUrl(creds.webhook_url);
  if (!validation.valid) {
    return { ok: false, error: `Webhook URL invalid: ${validation.error}` };
  }

  try {
    const res = await fetch(creds.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
      redirect: "error", // SSRF: block redirects to internal hosts
    });

    if (!res.ok) {
      return { ok: false, error: `Webhook returned ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Webhook call failed",
    };
  }
}

/** Test a webhook URL by sending a test payload */
export async function testZapierWebhook(
  webhookUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const validation = isValidWebhookUrl(webhookUrl);
  if (!validation.valid) return { ok: false, error: validation.error };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        test: true,
        source: "ShowReady",
        message: "This is a test webhook from ShowReady",
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error", // SSRF: block redirects to internal hosts
    });

    if (!res.ok) {
      return { ok: false, error: `Webhook returned ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Webhook test failed",
    };
  }
}
