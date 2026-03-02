/**
 * Cloze CRM Client
 *
 * Dual auth: OAuth bearer token OR API key (email + key query params).
 * All write methods set `from` to the agent's email (Cloze gotcha:
 * if `from` is the visitor's email, the timeline entry shows under
 * their profile — not the agent's).
 */

import {
  ClozeStoredCredentials,
  ClozeOAuthTokens,
  ClozePerson,
  ClozeTimelineEntry,
  ClozeTodo,
  CLOZE_OAUTH_CONFIG,
} from "./types";
import { encrypt, decrypt } from "../../crypto";
import { createServiceClient } from "../../supabase-server";

// ── Credential helpers ──

/** Load and decrypt credentials for a user + integration */
export async function loadCredentials(
  userId: string,
): Promise<ClozeStoredCredentials | null> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("integration_credentials")
    .select("credentials_encrypted, auth_type")
    .eq("user_id", userId)
    .eq("integration", "cloze")
    .eq("is_active", true)
    .single();

  if (!data) return null;

  try {
    const creds: ClozeStoredCredentials = JSON.parse(
      decrypt(data.credentials_encrypted),
    );
    creds.auth_type = data.auth_type as "oauth" | "api_key";
    return creds;
  } catch {
    return null;
  }
}

/** Encrypt and save credentials */
export async function saveCredentials(
  userId: string,
  creds: ClozeStoredCredentials,
  email?: string,
): Promise<void> {
  const supabase = await createServiceClient();
  const encrypted = encrypt(JSON.stringify(creds));

  await supabase.from("integration_credentials").upsert(
    {
      user_id: userId,
      integration: "cloze",
      auth_type: creds.auth_type,
      credentials_encrypted: encrypted,
      email: email ?? creds.user_email ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,integration" },
  );
}

/** Delete (deactivate) credentials */
export async function deleteCredentials(userId: string): Promise<void> {
  const supabase = await createServiceClient();
  await supabase
    .from("integration_credentials")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("integration", "cloze");
}

// ── Token refresh ──

async function refreshOAuthToken(
  creds: ClozeStoredCredentials,
  userId: string,
): Promise<string | null> {
  if (!creds.refresh_token) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: creds.refresh_token,
    client_id: process.env.CLOZE_CLIENT_ID!,
    client_secret: process.env.CLOZE_CLIENT_SECRET!,
  });

  const res = await fetch(CLOZE_OAUTH_CONFIG.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) return null;

  const tokens: ClozeOAuthTokens = await res.json();
  const updated: ClozeStoredCredentials = {
    auth_type: "oauth",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || creds.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };

  await saveCredentials(userId, updated);
  return tokens.access_token;
}

// ── Core API caller ──

async function clozeApi(
  method: "GET" | "POST",
  path: string,
  userId: string,
  body?: object,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const creds = await loadCredentials(userId);
  if (!creds) return { ok: false, error: "No Cloze credentials configured" };

  let url = `${CLOZE_OAUTH_CONFIG.apiBaseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (creds.auth_type === "api_key") {
    // API key auth: email + api_key as query params
    const sep = url.includes("?") ? "&" : "?";
    url += `${sep}user=${encodeURIComponent(creds.user_email!)}&api_key=${encodeURIComponent(creds.api_key!)}`;
  } else {
    // OAuth: bearer token with auto-refresh
    let token = creds.access_token!;
    const bufferMs = 5 * 60 * 1000;
    if (creds.expires_at && Date.now() > creds.expires_at - bufferMs) {
      const refreshed = await refreshOAuthToken(creds, userId);
      if (!refreshed) return { ok: false, error: "OAuth token expired and refresh failed" };
      token = refreshed;
    }
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Cloze API ${res.status}: ${text.slice(0, 200)}` };
  }

  const data = await res.json().catch(() => ({})) as Record<string, unknown>;

  // Cloze returns HTTP 200 with errorcode != 0 for many failures
  if (data.errorcode && data.errorcode !== 0) {
    const msg = (data.message as string) || `errorcode ${data.errorcode}`;
    console.error(`[Cloze API] ${path} returned errorcode ${data.errorcode}: ${msg}`);
    return { ok: false, error: `Cloze error: ${msg}` };
  }

  return { ok: true, data };
}

// ── Public API methods ──

/** Test connection — calls GET /v1/profile */
export async function testConnection(
  userId: string,
): Promise<{ ok: boolean; email?: string; error?: string }> {
  const result = await clozeApi("GET", "/profile", userId);
  if (!result.ok) return { ok: false, error: result.error };

  const profile = result.data as { name?: string; emailAddresses?: Array<{ value: string }> };
  const email = profile.emailAddresses?.[0]?.value;
  return { ok: true, email };
}

/** Test connection with raw credentials (before saving) */
export async function testRawApiKey(
  email: string,
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = `${CLOZE_OAUTH_CONFIG.apiBaseUrl}/profile?user=${encodeURIComponent(email)}&api_key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return { ok: false, error: `Cloze returned ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

/** Create or update a person in Cloze */
export async function pushPerson(
  userId: string,
  person: ClozePerson,
): Promise<{ ok: boolean; error?: string }> {
  return clozeApi("POST", "/people/create", userId, person);
}

/** Add a timeline note — uses /createcontent (proven WP toolkit pattern) */
export async function createTimelineNote(
  userId: string,
  entry: ClozeTimelineEntry,
): Promise<{ ok: boolean; error?: string }> {
  const now = Date.now();
  const record = {
    uniqueid: `showready-note-${now}-${Math.random().toString(36).slice(2, 8)}`,
    style: "note",
    from: entry.to || entry.from, // from = contact identifier so note appears on their profile
    subject: entry.subject,
    body: entry.body,
    source: "showready.vercel.app",
    date: now,
  };
  return clozeApi("POST", "/createcontent", userId, record);
}

/** Create a follow-up todo — uses /createcontent style:todo (proven WP toolkit pattern) */
export async function createTodo(
  userId: string,
  todo: ClozeTodo,
): Promise<{ ok: boolean; error?: string }> {
  const now = Date.now();
  // Calculate due date as epoch ms
  const dueMs = todo.due ? new Date(todo.due).getTime() : now;
  const record = {
    uniqueid: `showready-todo-${now}-${Math.random().toString(36).slice(2, 8)}`,
    style: "todo",
    from: todo.participants?.[0] || todo.from, // from = contact identifier so todo links to them
    subject: todo.subject,
    body: todo.body,
    source: "showready.vercel.app",
    date: now,
    due: dueMs,
  };
  return clozeApi("POST", "/createcontent", userId, record);
}

/** Get profile (verify connection) */
export async function getProfile(
  userId: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  return clozeApi("GET", "/profile", userId);
}
