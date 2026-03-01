import { NextRequest, NextResponse } from "next/server";
import { processRetryQueue } from "@/lib/integrations/crm-retry";

/**
 * POST /api/cron/crm-retry
 *
 * Processes failed CRM pushes from the retry queue.
 * Authenticated via CRON_SECRET header to prevent unauthorized invocation.
 *
 * Call via: Vercel Cron, external scheduler, or manual trigger.
 * Recommended: every 5 minutes.
 */
export async function POST(request: NextRequest) {
  // Authenticate cron request
  const cronSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    console.error("[CRM Retry Cron] CRON_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (cronSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processRetryQueue();

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error("[CRM Retry Cron] Error:",
      err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json(
      { error: "Retry processing failed" },
      { status: 500 },
    );
  }
}
