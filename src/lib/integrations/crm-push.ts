/**
 * CRM Push Orchestrator
 *
 * Fires after a visitor signs in (kiosk or QR).
 * Non-blocking — errors are logged, never bubble to the visitor.
 * Self-contained: resolves agent email, event, and property from DB.
 * Supports: Cloze (2.2), FUB + Zapier (2.3).
 */

import { createServiceClient } from "../supabase-server";
import { loadCredentials, pushPerson, createTimelineNote, createTodo } from "./cloze/client";
import { loadFUBCredentials } from "./fub/client";
import { pushFUBEvent } from "./fub/client";
import { loadZapierCredentials, pushZapierWebhook } from "./zapier/client";
import { normalizePhone } from "./phone";

interface IntegrationSettings {
  push_visitors: boolean;
  create_todos: boolean;
  log_timeline: boolean;
}

const DEFAULT_SETTINGS: IntegrationSettings = {
  push_visitors: true,
  create_todos: true,
  log_timeline: true,
};

interface VisitorData {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  answers: Record<string, string>;
  source: string;
}

interface ResolvedContext {
  visitor: VisitorData;
  eventId: string;
  eventName: string;
  eventDate: string;
  userId: string;
  agentEmail: string;
  property: {
    address: string;
    city: string | null;
    state: string | null;
    price: number | null;
    beds: number | null;
    baths: number | null;
  } | null;
}

/** Load integration settings from credentials table */
async function loadIntegrationSettings(
  userId: string,
  integration: string,
): Promise<IntegrationSettings> {
  try {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from("integration_credentials")
      .select("settings")
      .eq("user_id", userId)
      .eq("integration", integration)
      .eq("is_active", true)
      .single();

    if (!data?.settings) return DEFAULT_SETTINGS;
    const s = data.settings as Record<string, boolean>;
    return {
      push_visitors: s.push_visitors !== false,
      create_todos: s.create_todos !== false,
      log_timeline: s.log_timeline !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Push a visitor to all enabled CRMs.
 * Self-resolves all context from visitor ID + event data.
 * Call fire-and-forget — do NOT await in request handlers.
 */
export async function pushVisitorToCRMs(
  visitorId: string,
  eventId: string,
  visitor: VisitorData,
): Promise<void> {
  try {
    const ctx = await resolveContext(visitorId, eventId, visitor);
    if (!ctx) return; // Event/user not found — nothing to push

    const results: Array<{ integration: string; status: string; error?: string }> = [];

    // Cloze
    try {
      const creds = await loadCredentials(ctx.userId);
      if (creds) {
        const s = await loadIntegrationSettings(ctx.userId, "cloze");
        if (s.push_visitors) {
          const clozeResult = await pushToCloze(ctx, s);
          results.push({ integration: "cloze", ...clozeResult });
        }
      }
    } catch (err) {
      results.push({
        integration: "cloze",
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }

    // Follow Up Boss
    try {
      const fubCreds = await loadFUBCredentials(ctx.userId);
      if (fubCreds) {
        const s = await loadIntegrationSettings(ctx.userId, "fub");
        if (s.push_visitors) {
          const fubResult = await pushToFUB(ctx);
          results.push({ integration: "fub", ...fubResult });
        }
      }
    } catch (err) {
      results.push({
        integration: "fub",
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }

    // Zapier webhook
    try {
      const zapCreds = await loadZapierCredentials(ctx.userId);
      if (zapCreds) {
        const s = await loadIntegrationSettings(ctx.userId, "zapier");
        if (s.push_visitors) {
          const zapResult = await pushToZapier(ctx);
          results.push({ integration: "zapier", ...zapResult });
        }
      }
    } catch (err) {
      results.push({
        integration: "zapier",
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }

    // Log sync results
    await logSyncResults(visitorId, eventId, results);
  } catch (err) {
    console.error("[CRM Push] Top-level error for visitor", visitorId,
      err instanceof Error ? err.message : "Unknown error");
  }
}

/** Resolve full context from DB: agent email, event name, property details */
async function resolveContext(
  visitorId: string,
  eventId: string,
  visitor: VisitorData,
): Promise<ResolvedContext | null> {
  const supabase = await createServiceClient();

  // Fetch event + property in one query
  const { data: event } = await supabase
    .from("events")
    .select("id, user_id, name, event_date, property:properties(address, city, state, price, beds, baths)")
    .eq("id", eventId)
    .single();

  if (!event) return null;

  // Fetch agent email from auth.users via admin API
  const { data: userData } = await supabase.auth.admin.getUserById(event.user_id);
  const agentEmail = userData?.user?.email;

  if (!agentEmail) {
    console.error("[CRM Push] No email found for agent", event.user_id);
    return null;
  }

  // property comes as object or array from join — normalize
  const prop = Array.isArray(event.property) ? event.property[0] : event.property;

  return {
    visitor,
    eventId,
    eventName: event.name,
    eventDate: event.event_date,
    userId: event.user_id,
    agentEmail,
    property: prop || null,
  };
}

async function pushToCloze(
  ctx: ResolvedContext,
  settings: IntegrationSettings,
): Promise<{ status: string; error?: string }> {
  const { userId, visitor, agentEmail } = ctx;
  const phone = visitor.phone ? normalizePhone(visitor.phone) : undefined;

  // 1. Create/update person in Cloze — include property as note
  const propertyInfo = ctx.property
    ? `${ctx.property.address}${ctx.property.city ? `, ${ctx.property.city}` : ""}${ctx.property.state ? ` ${ctx.property.state}` : ""}`
    : "Unknown property";

  const priceStr = ctx.property?.price
    ? ` ($${Number(ctx.property.price).toLocaleString()})`
    : "";

  const personResult = await pushPerson(userId, {
    name: [visitor.first_name, visitor.last_name].filter(Boolean).join(" "),
    emails: visitor.email ? [{ value: visitor.email }] : undefined,
    phones: phone ? [{ value: phone }] : undefined,
    keywords: ["open-house-visitor", `event:${ctx.eventName}`],
    stage: "lead",
    segment: "customer",
    notes: `Open house visitor at ${propertyInfo}${priceStr} — ${ctx.eventName} (${ctx.eventDate}). Source: ${visitor.source}`,
  });

  if (!personResult.ok) {
    return { status: "failed", error: personResult.error };
  }

  // 2. Timeline note — from = agent email (NOT visitor!)
  let timelineOk = true;
  if (settings.log_timeline) {
    const answersText =
      Object.keys(visitor.answers).length > 0
        ? "\n\nCustom Answers:\n" +
          Object.entries(visitor.answers)
            .map(([q, a]) => `- ${q}: ${a}`)
            .join("\n")
        : "";

    const visitorName = [visitor.first_name, visitor.last_name].filter(Boolean).join(" ");
    const timelineResult = await createTimelineNote(userId, {
      type: "note",
      subject: `Open House Visit — ${propertyInfo}`,
      body:
        `${visitor.first_name}${visitor.last_name ? " " + visitor.last_name : ""} visited open house at ${propertyInfo}${priceStr}.\n` +
        `Event: ${ctx.eventName} (${ctx.eventDate})\n` +
        `Source: ${visitor.source}` +
        (visitor.phone ? `\nPhone: ${phone || visitor.phone}` : "") +
        answersText,
      from: agentEmail, // CRITICAL: agent email, never visitor
      to: visitor.email || phone || undefined, // link to contact via email or phone
      toName: visitorName,
      date: new Date().toISOString(),
    });
    timelineOk = timelineResult.ok;
  }

  // 3. Follow-up todo — due next morning 9am, linked to visitor contact
  let todoOk = true;
  if (settings.create_todos) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    // participants links the todo to the visitor in Cloze agenda
    const participants: string[] = [];
    if (phone) participants.push(phone);
    else if (visitor.email) participants.push(visitor.email);

    const todoResult = await createTodo(userId, {
      subject: `Follow up: ${visitor.first_name} — ${propertyInfo}`,
      body: `Visited open house at ${propertyInfo}${priceStr} via ${visitor.source}. Event: ${ctx.eventName} (${ctx.eventDate}). ${visitor.email ? `Email: ${visitor.email}` : "No email."} ${phone ? `Phone: ${phone}` : ""}`,
      from: agentEmail,
      due: tomorrow.toISOString(),
      participants,
    });
    todoOk = todoResult.ok;
  }

  // Report partial if timeline or todo failed
  if (!timelineOk || !todoOk) {
    const failures = [
      !timelineOk && "timeline",
      !todoOk && "todo",
    ].filter(Boolean).join(", ");
    return { status: "partial", error: `Person created but ${failures} failed` };
  }

  return { status: "success" };
}

async function pushToFUB(
  ctx: ResolvedContext,
): Promise<{ status: string; error?: string }> {
  const { visitor, agentEmail } = ctx;
  const phone = visitor.phone ? normalizePhone(visitor.phone) : undefined;

  const propertyInfo = ctx.property
    ? `${ctx.property.address}${ctx.property.city ? `, ${ctx.property.city}` : ""}${ctx.property.state ? ` ${ctx.property.state}` : ""}`
    : undefined;

  const result = await pushFUBEvent(ctx.userId, {
    source: "ShowReady",
    type: "Visited Open House",
    person: {
      firstName: visitor.first_name,
      lastName: visitor.last_name || undefined,
      emails: visitor.email ? [{ value: visitor.email }] : undefined,
      phones: phone ? [{ value: phone }] : undefined,
      tags: ["open-house-visitor", ctx.eventName],
    },
    property: ctx.property
      ? {
          street: ctx.property.address,
          city: ctx.property.city || undefined,
          state: ctx.property.state || undefined,
          price: ctx.property.price || undefined,
          bedrooms: ctx.property.beds || undefined,
          bathrooms: ctx.property.baths || undefined,
        }
      : undefined,
    description: `Visited open house at ${propertyInfo || "property"} on ${ctx.eventDate}`,
    message: `Source: ${visitor.source}. Agent: ${agentEmail}`,
  });

  return result.ok
    ? { status: "success" }
    : { status: "failed", error: result.error };
}

async function pushToZapier(
  ctx: ResolvedContext,
): Promise<{ status: string; error?: string }> {
  const result = await pushZapierWebhook(ctx.userId, {
    event_name: ctx.eventName,
    event_date: ctx.eventDate,
    visitor_first_name: ctx.visitor.first_name,
    visitor_last_name: ctx.visitor.last_name,
    visitor_email: ctx.visitor.email,
    visitor_phone: ctx.visitor.phone,
    visitor_source: ctx.visitor.source,
    visitor_answers: ctx.visitor.answers,
    property_address: ctx.property?.address || null,
    property_city: ctx.property?.city || null,
    property_state: ctx.property?.state || null,
    property_price: ctx.property?.price || null,
    property_beds: ctx.property?.beds || null,
    property_baths: ctx.property?.baths || null,
    agent_email: ctx.agentEmail,
    timestamp: new Date().toISOString(),
  });

  return result.ok
    ? { status: "success" }
    : { status: "failed", error: result.error };
}

async function logSyncResults(
  visitorId: string,
  eventId: string,
  results: Array<{ integration: string; status: string; error?: string }>,
): Promise<void> {
  if (results.length === 0) return;

  try {
    const supabase = await createServiceClient();

    // Insert sync log entries
    await supabase.from("crm_sync_log").insert(
      results.map((r) => ({
        visitor_id: visitorId,
        event_id: eventId,
        integration: r.integration,
        action: "visitor_push",
        status: r.status === "success" ? "success" : "retrying",
        error_message: r.error?.slice(0, 500) || null, // Truncate, no full PII in logs
      })),
    );

    // Update visitor.crm_sync_status JSONB (read-merge-write to preserve other integrations)
    const { data: existingVisitor } = await supabase
      .from("visitors")
      .select("crm_sync_status")
      .eq("id", visitorId)
      .single();

    const current = (existingVisitor?.crm_sync_status as Record<string, string>) || {};
    for (const r of results) {
      current[r.integration] = r.status === "success" ? "success" : "retrying";
    }

    await supabase
      .from("visitors")
      .update({ crm_sync_status: current })
      .eq("id", visitorId);
  } catch (err) {
    // Logging failure should never break the flow
    console.error("[CRM Push] Failed to log sync results for visitor", visitorId,
      err instanceof Error ? err.message : "Unknown error");
  }
}
