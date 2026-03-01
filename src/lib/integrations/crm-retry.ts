/**
 * CRM Retry Queue
 *
 * Picks up failed CRM pushes from crm_sync_log and retries them.
 * Max 3 attempts with exponential backoff (5min, 15min, 45min between attempts).
 * After 3 failures, marks as permanently failed.
 *
 * Backoff measured from updated_at (last attempt time), not created_at.
 *
 * Called by: /api/cron/crm-retry (authenticated cron endpoint)
 */

import { createServiceClient } from "../supabase-server";
import { loadCredentials } from "./cloze/client";
import { pushPerson, createTimelineNote, createTodo } from "./cloze/client";
import { loadFUBCredentials, pushFUBEvent } from "./fub/client";
import { loadZapierCredentials, pushZapierWebhook } from "./zapier/client";
import { normalizePhone } from "./phone";

const MAX_ATTEMPTS = 3;

// Backoff between attempts: 5min, 15min, 45min (measured from last attempt)
const BACKOFF_MINUTES = [5, 15, 45];

interface RetryableEntry {
  id: string;
  visitor_id: string;
  event_id: string;
  integration: string;
  attempts: number;
  updated_at: string;
}

/**
 * Process all retryable CRM sync entries.
 * Returns summary of what happened.
 */
export async function processRetryQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  permanently_failed: number;
}> {
  const supabase = await createServiceClient();

  // Fetch retryable entries (status = 'retrying', under max attempts)
  const { data: entries, error } = await supabase
    .from("crm_sync_log")
    .select("id, visitor_id, event_id, integration, attempts, updated_at")
    .eq("status", "retrying")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(50); // Process in batches to avoid timeouts

  if (error || !entries || entries.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, permanently_failed: 0 };
  }

  // Filter by backoff: only process entries whose backoff period has elapsed
  // Backoff measured from updated_at (last attempt time)
  const now = Date.now();
  const eligible = entries.filter((entry) => {
    const lastAttemptAt = new Date(entry.updated_at).getTime();
    const backoffMs = (BACKOFF_MINUTES[entry.attempts - 1] || 45) * 60 * 1000;
    return now - lastAttemptAt >= backoffMs;
  });

  if (eligible.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, permanently_failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  let permanently_failed = 0;
  const nowIso = new Date().toISOString();

  for (const entry of eligible) {
    const result = await retryEntry(supabase, entry);

    if (result.ok) {
      // Mark as success
      await supabase
        .from("crm_sync_log")
        .update({ status: "success", attempts: entry.attempts + 1, updated_at: nowIso })
        .eq("id", entry.id);

      // Update visitor crm_sync_status
      await updateVisitorSyncStatus(supabase, entry.visitor_id, entry.integration, "success");
      succeeded++;
    } else if (entry.attempts + 1 >= MAX_ATTEMPTS) {
      // Max attempts reached — permanently failed
      await supabase
        .from("crm_sync_log")
        .update({
          status: "failed",
          attempts: entry.attempts + 1,
          error_message: result.error?.slice(0, 500) || null,
          updated_at: nowIso,
        })
        .eq("id", entry.id);

      await updateVisitorSyncStatus(supabase, entry.visitor_id, entry.integration, "failed");
      permanently_failed++;
    } else {
      // Still retryable — increment attempts, keep status as retrying
      await supabase
        .from("crm_sync_log")
        .update({
          status: "retrying",
          attempts: entry.attempts + 1,
          error_message: result.error?.slice(0, 500) || null,
          updated_at: nowIso,
        })
        .eq("id", entry.id);
      failed++;
    }
  }

  return {
    processed: eligible.length,
    succeeded,
    failed,
    permanently_failed,
  };
}

/** Retry a single CRM sync entry — uses shared supabase client (LOW-1 fix) */
async function retryEntry(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  entry: RetryableEntry,
): Promise<{ ok: boolean; error?: string }> {
  // Fetch visitor data
  const { data: visitor } = await supabase
    .from("visitors")
    .select("id, first_name, last_name, email, phone, answers, source, event_id, user_id")
    .eq("id", entry.visitor_id)
    .single();

  if (!visitor) {
    return { ok: false, error: "Visitor not found" };
  }

  // Fetch event + property
  const { data: event } = await supabase
    .from("events")
    .select("id, user_id, name, event_date, property:properties(address, city, state, price, beds, baths)")
    .eq("id", entry.event_id)
    .single();

  if (!event) {
    return { ok: false, error: "Event not found" };
  }

  // Get agent email
  const { data: userData } = await supabase.auth.admin.getUserById(event.user_id);
  const agentEmail = userData?.user?.email;
  if (!agentEmail) {
    return { ok: false, error: "Agent email not found" };
  }

  const prop = Array.isArray(event.property) ? event.property[0] : event.property;

  try {
    switch (entry.integration) {
      case "cloze":
        return await retryCloze(event.user_id, visitor, agentEmail, event, prop);
      case "fub":
        return await retryFUB(event.user_id, visitor, agentEmail, event, prop);
      case "zapier":
        return await retryZapier(event.user_id, visitor, agentEmail, event, prop);
      default:
        return { ok: false, error: `Unknown integration: ${entry.integration}` };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Retry failed",
    };
  }
}

async function retryCloze(
  userId: string,
  visitor: { first_name: string; last_name: string | null; email: string | null; phone: string | null; answers: Record<string, string>; source: string },
  agentEmail: string,
  event: { name: string; event_date: string },
  prop: { address: string; city: string | null; state: string | null; price: number | null; beds: number | null; baths: number | null } | null,
): Promise<{ ok: boolean; error?: string }> {
  const creds = await loadCredentials(userId);
  if (!creds) return { ok: false, error: "No Cloze credentials" };

  const phone = visitor.phone ? normalizePhone(visitor.phone) : undefined;

  const personResult = await pushPerson(userId, {
    name: [visitor.first_name, visitor.last_name].filter(Boolean).join(" "),
    emails: visitor.email ? [{ value: visitor.email }] : undefined,
    phones: phone ? [{ value: phone }] : undefined,
    keywords: ["open-house-visitor", `event:${event.name}`],
  });

  if (!personResult.ok) return { ok: false, error: personResult.error };

  const propertyInfo = prop
    ? `${prop.address}${prop.city ? `, ${prop.city}` : ""}${prop.state ? ` ${prop.state}` : ""}`
    : "Unknown property";

  // MEDIUM-3 fix: check timeline + todo results (not fire-and-forget)
  const timelineResult = await createTimelineNote(userId, {
    type: "note",
    subject: `Open House Visit — ${propertyInfo}`,
    body: `${visitor.first_name}${visitor.last_name ? " " + visitor.last_name : ""} visited open house at ${propertyInfo}. Event: ${event.name} (${event.event_date}). Source: ${visitor.source}`,
    from: agentEmail,
    to: visitor.email || undefined,
    date: new Date().toISOString(),
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const todoResult = await createTodo(userId, {
    subject: `Follow up with ${visitor.first_name} from ${event.name}`,
    body: `Visited ${propertyInfo} via ${visitor.source}.`,
    from: agentEmail,
    due: tomorrow.toISOString(),
    priority: "normal",
  });

  if (!timelineResult.ok || !todoResult.ok) {
    const failures = [
      !timelineResult.ok && "timeline",
      !todoResult.ok && "todo",
    ].filter(Boolean).join(", ");
    return { ok: false, error: `Person created but ${failures} failed` };
  }

  return { ok: true };
}

async function retryFUB(
  userId: string,
  visitor: { first_name: string; last_name: string | null; email: string | null; phone: string | null; source: string },
  agentEmail: string,
  event: { name: string; event_date: string },
  prop: { address: string; city: string | null; state: string | null; price: number | null; beds: number | null; baths: number | null } | null,
): Promise<{ ok: boolean; error?: string }> {
  const creds = await loadFUBCredentials(userId);
  if (!creds) return { ok: false, error: "No FUB credentials" };

  const phone = visitor.phone ? normalizePhone(visitor.phone) : undefined;
  const propertyInfo = prop
    ? `${prop.address}${prop.city ? `, ${prop.city}` : ""}${prop.state ? ` ${prop.state}` : ""}`
    : undefined;

  return pushFUBEvent(userId, {
    source: "ShowReady",
    type: "Visited Open House",
    person: {
      firstName: visitor.first_name,
      lastName: visitor.last_name || undefined,
      emails: visitor.email ? [{ value: visitor.email }] : undefined,
      phones: phone ? [{ value: phone }] : undefined,
      tags: ["open-house-visitor", event.name],
    },
    property: prop
      ? {
          street: prop.address,
          city: prop.city || undefined,
          state: prop.state || undefined,
          price: prop.price || undefined,
          bedrooms: prop.beds || undefined,
          bathrooms: prop.baths || undefined,
        }
      : undefined,
    description: `Visited open house at ${propertyInfo || "property"} on ${event.event_date}`,
    message: `Source: ${visitor.source}. Agent: ${agentEmail}`,
  });
}

async function retryZapier(
  userId: string,
  visitor: { first_name: string; last_name: string | null; email: string | null; phone: string | null; answers: Record<string, string>; source: string },
  agentEmail: string,
  event: { name: string; event_date: string },
  prop: { address: string; city: string | null; state: string | null; price: number | null; beds: number | null; baths: number | null } | null,
): Promise<{ ok: boolean; error?: string }> {
  const creds = await loadZapierCredentials(userId);
  if (!creds) return { ok: false, error: "No Zapier credentials" };

  return pushZapierWebhook(userId, {
    event_name: event.name,
    event_date: event.event_date,
    visitor_first_name: visitor.first_name,
    visitor_last_name: visitor.last_name,
    visitor_email: visitor.email,
    visitor_phone: visitor.phone,
    visitor_source: visitor.source,
    visitor_answers: visitor.answers,
    property_address: prop?.address || null,
    property_city: prop?.city || null,
    property_state: prop?.state || null,
    property_price: prop?.price || null,
    property_beds: prop?.beds || null,
    property_baths: prop?.baths || null,
    agent_email: agentEmail,
    timestamp: new Date().toISOString(),
  });
}

/** Update a single integration's status in visitor.crm_sync_status JSONB */
async function updateVisitorSyncStatus(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  visitorId: string,
  integration: string,
  status: string,
): Promise<void> {
  try {
    // Read current status, merge, write back
    const { data: visitor } = await supabase
      .from("visitors")
      .select("crm_sync_status")
      .eq("id", visitorId)
      .single();

    const current = (visitor?.crm_sync_status as Record<string, string>) || {};
    current[integration] = status;

    await supabase
      .from("visitors")
      .update({ crm_sync_status: current })
      .eq("id", visitorId);
  } catch {
    // Non-critical — don't fail retry for status update
  }
}
