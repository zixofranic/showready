// ── Cloze OAuth ──

export interface ClozeOAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface ClozeStoredCredentials {
  auth_type: "oauth" | "api_key";
  // OAuth fields
  access_token?: string;
  refresh_token?: string;
  expires_at?: number; // epoch ms
  // API key fields
  api_key?: string;
  user_email?: string;
}

// ── Cloze API types ──

export interface ClozePerson {
  id?: string;
  name: string;
  emails?: Array<{ value: string }>;
  phones?: Array<{ value: string }>;
  keywords?: string[];
}

export interface ClozeTimelineEntry {
  type: string;
  subject: string;
  body: string;
  from: string; // MUST be agent email, not visitor
  to?: string;
  date?: string;
}

export interface ClozeTodo {
  subject: string;
  body?: string;
  from: string; // MUST be agent email
  due?: string;
  priority?: "high" | "normal" | "low";
}

export interface ClozeApiError {
  errorcode: number;
  message: string;
}

// ── Config ──

export const CLOZE_OAUTH_CONFIG = {
  authorizationEndpoint: "https://www.cloze.com/oauth/authorize",
  tokenEndpoint: "https://www.cloze.com/oauth/token",
  apiBaseUrl: "https://api.cloze.com/v1",
  scopes: ["basic", "change_content", "change_relation"],
} as const;
