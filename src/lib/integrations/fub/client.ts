/**
 * Follow Up Boss Client
 *
 * Auth: HTTP Basic (API key as username, empty password).
 * Main method: POST /v1/events with type "Visited Open House".
 */

import { FUBEvent, FUB_CONFIG, FUBStoredCredentials } from "./types";
import { encrypt, decrypt } from "../../crypto";
import { createServiceClient } from "../../supabase-server";

// ── Credential helpers ──

export async function loadFUBCredentials(
  userId: string,
): Promise<FUBStoredCredentials | null> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("integration_credentials")
    .select("credentials_encrypted")
    .eq("user_id", userId)
    .eq("integration", "fub")
    .eq("is_active", true)
    .single();

  if (!data) return null;

  try {
    return JSON.parse(decrypt(data.credentials_encrypted));
  } catch (err) {
    console.error(
      `[FUB] Failed to decrypt credentials for user ${userId}:`,
      err instanceof Error ? err.message : "Unknown error",
    );
    return null;
  }
}

export async function saveFUBCredentials(
  userId: string,
  apiKey: string,
): Promise<void> {
  const supabase = await createServiceClient();
  const creds: FUBStoredCredentials = { auth_type: "api_key", api_key: apiKey };
  const encrypted = encrypt(JSON.stringify(creds));

  await supabase.from("integration_credentials").upsert(
    {
      user_id: userId,
      integration: "fub",
      auth_type: "api_key",
      credentials_encrypted: encrypted,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,integration" },
  );
}

export async function deleteFUBCredentials(userId: string): Promise<void> {
  const supabase = await createServiceClient();
  await supabase
    .from("integration_credentials")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("integration", "fub");
}

// ── API caller ──

async function fubApi(
  method: "GET" | "POST",
  path: string,
  apiKey: string,
  body?: object,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const url = `${FUB_CONFIG.apiBaseUrl}${path}`;

  // Defense in depth: verify we only send credentials to FUB's domain
  const parsed = new URL(url);
  if (parsed.hostname !== "api.followupboss.com") {
    return { ok: false, error: "Invalid FUB API host" };
  }

  // HTTP Basic: API key as username, empty password
  const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `FUB API ${res.status}: ${text.slice(0, 200)}` };
  }

  const data = await res.json().catch(() => ({}));
  return { ok: true, data };
}

// ── Public API methods ──

/** Test connection — calls GET /v1/users (returns current user) */
export async function testFUBConnection(
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await fubApi("GET", "/users", apiKey);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

/** Post a visitor event to FUB */
export async function pushFUBEvent(
  userId: string,
  event: FUBEvent,
): Promise<{ ok: boolean; error?: string }> {
  const creds = await loadFUBCredentials(userId);
  if (!creds) return { ok: false, error: "No FUB credentials configured" };

  return fubApi("POST", "/events", creds.api_key, event);
}
