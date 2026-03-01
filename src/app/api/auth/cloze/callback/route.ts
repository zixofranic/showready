import { NextRequest, NextResponse } from "next/server";
import { CLOZE_OAUTH_CONFIG, ClozeOAuthTokens, ClozeStoredCredentials } from "@/lib/integrations/cloze/types";
import { saveCredentials } from "@/lib/integrations/cloze/client";

/**
 * GET /api/auth/cloze/callback
 * Cloze redirects here after user consents.
 * Exchanges code for tokens, encrypts and stores in DB.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const settingsUrl = `${baseUrl}/settings/integrations`;

  // Handle OAuth error from Cloze
  if (oauthError) {
    return NextResponse.redirect(
      `${settingsUrl}?cloze=error&message=${encodeURIComponent(oauthError)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${settingsUrl}?cloze=error&message=missing_params`);
  }

  // Verify state (CSRF protection)
  const savedState = request.cookies.get("cloze_oauth_state")?.value;
  const userId = request.cookies.get("cloze_oauth_uid")?.value;

  if (!savedState || state !== savedState) {
    return NextResponse.redirect(
      `${settingsUrl}?cloze=error&message=state_mismatch`,
    );
  }

  if (!userId) {
    return NextResponse.redirect(
      `${settingsUrl}?cloze=error&message=session_expired`,
    );
  }

  // Exchange code for tokens
  const redirectUri = `${baseUrl}/api/auth/cloze/callback`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: process.env.CLOZE_CLIENT_ID!,
    client_secret: process.env.CLOZE_CLIENT_SECRET!,
  });

  const tokenRes = await fetch(CLOZE_OAUTH_CONFIG.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => "unknown");
    console.error("[Cloze OAuth] Token exchange failed:", errText);
    return NextResponse.redirect(
      `${settingsUrl}?cloze=error&message=token_exchange_failed`,
    );
  }

  const tokens: ClozeOAuthTokens = await tokenRes.json();

  // Fetch profile to get email
  let email: string | undefined;
  try {
    const profileRes = await fetch(
      `${CLOZE_OAUTH_CONFIG.apiBaseUrl}/profile`,
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (profileRes.ok) {
      const profile = await profileRes.json();
      email = profile.emailAddresses?.[0]?.value;
    }
  } catch {
    // Profile fetch is nice-to-have, not critical
  }

  // Store encrypted credentials
  const creds: ClozeStoredCredentials = {
    auth_type: "oauth",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };

  await saveCredentials(userId, creds, email);

  // Clear OAuth cookies and redirect to settings
  const response = NextResponse.redirect(`${settingsUrl}?cloze=connected`);
  response.cookies.delete("cloze_oauth_state");
  response.cookies.delete("cloze_oauth_uid");

  return response;
}
