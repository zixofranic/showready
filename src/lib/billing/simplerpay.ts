/**
 * SimplerPay Billing Client
 *
 * Reports metered usage to the SimplerPay Edge Function (hosted on Simpler OS Supabase).
 * Used for all billable AI services (staging, twilight, sky, declutter, upscale, video).
 *
 * Auth: x-app-key header with format sk_{app_id}_{32-char-hex}
 * Idempotency: every report_usage call requires a unique idempotency_key
 */

const LOG_PREFIX = "[SimplerPay]";

interface UsageReport {
  user_email: string;
  action: string;
  cost_cents: number;
  idempotency_key: string;
  metadata?: Record<string, unknown>;
}

interface BalanceResponse {
  balance_cents: number;
  spending_cap_cents: number | null;
  soft_cap_cents: number | null;
  usage_this_month_cents: number;
}

interface UsageHistoryEntry {
  action: string;
  cost_cents: number;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface BillingResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

function getConfig() {
  const url = process.env.SIMPLER_OS_SUPABASE_URL;
  const key = process.env.SIMPLER_OS_APP_KEY;

  if (!url || !key) {
    throw new Error("SimplerPay not configured: SIMPLER_OS_SUPABASE_URL and SIMPLER_OS_APP_KEY required");
  }

  return { url: `${url}/functions/v1/billing`, key };
}

async function callBilling<T>(
  tool: string,
  args: object,
): Promise<BillingResult<T>> {
  const { url, key } = getConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000); // 10s

  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-key": key,
        },
        body: JSON.stringify({ tool, arguments: args }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await res.json();

    if (!res.ok) {
      console.error(`${LOG_PREFIX} ${tool} failed (${res.status}):`, data.error);
      return { ok: false, error: data.error || `HTTP ${res.status}`, status: res.status };
    }

    // Edge function wraps in content array
    const content = data.content?.[0]?.text;
    if (content) {
      try {
        return { ok: true, data: JSON.parse(content) };
      } catch {
        return { ok: true, data: content as T };
      }
    }

    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`${LOG_PREFIX} ${tool} error:`, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Report usage for a billable action.
 * Call BEFORE the AI operation — prevents free usage on billing failure.
 * Returns false if spending cap exceeded (HTTP 429).
 */
export async function reportUsage(
  report: UsageReport,
): Promise<BillingResult<{ recorded: boolean }>> {
  const result = await callBilling<{ recorded: boolean }>("report_usage", report);

  if (result.status === 429) {
    return { ok: false, error: "Spending cap exceeded", status: 429 };
  }

  return result;
}

/** Get current balance and spending info for a user. */
export async function getBalance(
  userEmail: string,
): Promise<BillingResult<BalanceResponse>> {
  return callBilling<BalanceResponse>("get_balance", { user_email: userEmail });
}

/** Get usage history for a user. */
export async function getUsageHistory(
  userEmail: string,
  limit = 20,
): Promise<BillingResult<UsageHistoryEntry[]>> {
  return callBilling<UsageHistoryEntry[]>("get_usage_history", {
    user_email: userEmail,
    limit,
  });
}

/**
 * Generate an idempotency key for a billable action.
 * Format: {action}_{property_id}_{timestamp}_{random}
 */
export function makeIdempotencyKey(
  action: string,
  propertyId: string,
): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${action}_${propertyId}_${ts}_${rand}`;
}

// Cost table for AI services (cents)
// TODO(chunk-3.2): Fetch from SimplerPay price_catalog instead of hardcoding
export const AI_COSTS = {
  staging: 20,       // $0.20 per image
  twilight: 20,      // $0.20 per image
  sky_replace: 20,   // $0.20 per image
  declutter: 20,     // $0.20 per image
  upscale: 10,       // $0.10 per image
  tour_video: 1500,  // $15.00 per video
} as const;

export type AIService = keyof typeof AI_COSTS;
