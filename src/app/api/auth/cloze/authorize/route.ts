import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireAuth } from "@/lib/api-helpers";
import { CLOZE_OAUTH_CONFIG } from "@/lib/integrations/cloze/types";

/**
 * GET /api/auth/cloze/authorize
 * Redirects agent to Cloze OAuth consent screen.
 * Stores state in a cookie for CSRF verification on callback.
 */
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const clientId = process.env.CLOZE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Cloze OAuth not configured" },
      { status: 500 },
    );
  }

  // Generate state for CSRF protection
  const state = randomBytes(16).toString("hex");

  // Build callback URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/auth/cloze/callback`;

  // Build Cloze authorization URL
  // NOTE: Do NOT send code_challenge — Cloze ignores it and shows a terminal
  // "You're In!" page instead of redirecting back. No PKCE support.
  const authUrl = new URL(CLOZE_OAUTH_CONFIG.authorizationEndpoint);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", CLOZE_OAUTH_CONFIG.scopes.join(" "));
  authUrl.searchParams.set("state", state);

  // Set state cookie (httpOnly, 10 min expiry)
  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set("cloze_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });
  // Also store user_id so callback knows who to save creds for
  response.cookies.set("cloze_oauth_uid", user!.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
