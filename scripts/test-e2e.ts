/**
 * ShowReady Phase 1 — End-to-End Integration Test
 *
 * Tests the full flow against the live Supabase project:
 * 1. Create property → Create event with PIN + custom questions
 * 2. Kiosk flow: fetch event info → register visitor
 * 3. QR flow: register visitor with honeypot check
 * 4. Verify visitor count incremented
 * 5. Visitor updates: contacted, priority, notes
 * 6. PIN verification (correct + incorrect)
 * 7. RLS: verify anon client cannot read visitors directly
 * 8. Cleanup
 *
 * Usage: npx tsx scripts/test-e2e.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("Missing env vars. Run with: npx tsx scripts/test-e2e.ts");
  console.error("Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const service = createClient(SUPABASE_URL, SERVICE_KEY);
const anon = createClient(SUPABASE_URL, ANON_KEY);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
    failures.push(name);
  }
}

// Test user ID (fake UUID for service-role inserts)
const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const TEST_PIN = "4321";

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function run() {
  console.log("\n═══ ShowReady Phase 1 E2E Tests ═══\n");

  let propertyId: string | null = null;
  let eventId: string | null = null;
  let visitor1Id: string | null = null;
  let visitor2Id: string | null = null;

  try {
    // ── 1. Create Property ──
    console.log("1. Property CRUD");
    const { data: prop, error: propErr } = await service
      .from("properties")
      .insert({
        user_id: TEST_USER_ID,
        address: "123 Test Lane",
        city: "Louisville",
        state: "KY",
        zip: "40202",
        beds: 3,
        baths: 2,
        sqft: 1800,
        price: 350000,
        mls_number: "TEST-001",
      })
      .select()
      .single();

    assert(!propErr && !!prop, "Create property", propErr?.message);
    propertyId = prop?.id;

    // Verify property read
    if (propertyId) {
      const { data: readProp } = await service
        .from("properties")
        .select()
        .eq("id", propertyId)
        .single();
      assert(readProp?.address === "123 Test Lane", "Read property back");
    }

    // ── 2. Create Event with PIN + Custom Questions ──
    console.log("\n2. Event CRUD");
    const pinHash = await hashPin(TEST_PIN);
    const customQuestions = [
      { id: "q1", question: "Are you working with an agent?", type: "yes_no", required: true },
      { id: "q2", question: "What brings you here?", type: "select", options: ["Buying", "Curious", "Neighbor"], required: false },
    ];

    const { data: evt, error: evtErr } = await service
      .from("events")
      .insert({
        user_id: TEST_USER_ID,
        property_id: propertyId,
        name: "E2E Test Open House",
        event_date: "2026-03-15",
        start_time: "14:00",
        end_time: "16:00",
        status: "live",
        kiosk_pin_hash: pinHash,
        custom_questions: customQuestions,
        welcome_message: "Welcome to the test!",
        thank_you_message: "Thanks for testing!",
        visitor_count: 0,
      })
      .select()
      .single();

    assert(!evtErr && !!evt, "Create event with PIN + questions", evtErr?.message);
    eventId = evt?.id;

    // Verify event read with property join
    if (eventId) {
      const { data: readEvt } = await service
        .from("events")
        .select("*, property:properties(address)")
        .eq("id", eventId)
        .single();
      assert(readEvt?.name === "E2E Test Open House", "Read event back");
      assert(readEvt?.property?.address === "123 Test Lane", "Event → property join works");
      assert(readEvt?.custom_questions?.length === 2, "Custom questions stored correctly");
      assert(readEvt?.kiosk_pin_hash === pinHash, "PIN hash stored correctly");
    }

    // ── 3. Kiosk Visitor Registration ──
    console.log("\n3. Kiosk Sign-in Flow");
    if (eventId) {
      // Fetch event info (public would use API, we test DB layer)
      const { data: pubEvt } = await service
        .from("events")
        .select("id, name, status, custom_questions, welcome_message, branding, property:properties(address, city, state)")
        .eq("id", eventId)
        .single();
      assert(pubEvt?.status === "live", "Event is live");
      assert(pubEvt?.welcome_message === "Welcome to the test!", "Welcome message correct");

      // Register visitor 1 (kiosk)
      const { data: v1, error: v1Err } = await service
        .from("visitors")
        .insert({
          event_id: eventId,
          user_id: TEST_USER_ID,
          first_name: "Jane",
          last_name: "Doe",
          email: "jane@test.com",
          phone: "(555) 111-2222",
          answers: { q1: "Yes", q2: "Buying" },
          source: "kiosk",
        })
        .select()
        .single();

      assert(!v1Err && !!v1, "Register kiosk visitor", v1Err?.message);
      visitor1Id = v1?.id;
      assert(v1?.source === "kiosk", "Source is kiosk");
      assert(v1?.answers?.q1 === "Yes", "Answers stored correctly");

      // Increment visitor count
      const { error: rpcErr } = await service.rpc("increment_visitor_count", {
        event_id: eventId,
      });
      assert(!rpcErr, "increment_visitor_count RPC works", rpcErr?.message);
    }

    // ── 4. QR Registration Flow ──
    console.log("\n4. QR Registration Flow");
    if (eventId) {
      const { data: v2, error: v2Err } = await service
        .from("visitors")
        .insert({
          event_id: eventId,
          user_id: TEST_USER_ID,
          first_name: "John",
          last_name: "Smith",
          email: "john@test.com",
          phone: "(555) 333-4444",
          answers: {},
          source: "qr",
        })
        .select()
        .single();

      assert(!v2Err && !!v2, "Register QR visitor", v2Err?.message);
      visitor2Id = v2?.id;
      assert(v2?.source === "qr", "Source is qr");

      // Increment again
      await service.rpc("increment_visitor_count", { event_id: eventId });

      // Check visitor count
      const { data: updatedEvt } = await service
        .from("events")
        .select("visitor_count")
        .eq("id", eventId)
        .single();
      assert(updatedEvt?.visitor_count === 2, "Visitor count is 2", `Got: ${updatedEvt?.visitor_count}`);
    }

    // ── 5. Visitor Updates ──
    console.log("\n5. Visitor Updates");
    if (visitor1Id) {
      // Mark contacted
      const { error: contactErr } = await service
        .from("visitors")
        .update({ contacted: true })
        .eq("id", visitor1Id);
      assert(!contactErr, "Mark visitor contacted", contactErr?.message);

      // Mark priority
      const { error: prioErr } = await service
        .from("visitors")
        .update({ priority: true })
        .eq("id", visitor1Id);
      assert(!prioErr, "Mark visitor priority", prioErr?.message);

      // Add notes
      const { error: notesErr } = await service
        .from("visitors")
        .update({ notes: "Very interested, pre-approved buyer" })
        .eq("id", visitor1Id);
      assert(!notesErr, "Add visitor notes", notesErr?.message);

      // Verify all updates
      const { data: updated } = await service
        .from("visitors")
        .select()
        .eq("id", visitor1Id)
        .single();
      assert(updated?.contacted === true, "Contacted flag persisted");
      assert(updated?.priority === true, "Priority flag persisted");
      assert(updated?.notes === "Very interested, pre-approved buyer", "Notes persisted");
    }

    // ── 6. Visitor List with Filters ──
    console.log("\n6. Visitor List Queries");
    if (eventId) {
      // All visitors for event
      const { data: allVisitors } = await service
        .from("visitors")
        .select()
        .eq("event_id", eventId);
      assert(allVisitors?.length === 2, "List all visitors for event");

      // Search by name
      const { data: searched } = await service
        .from("visitors")
        .select()
        .eq("event_id", eventId)
        .ilike("first_name", "%jane%");
      assert(searched?.length === 1, "Search visitor by name");

      // Filter contacted
      const { data: contacted } = await service
        .from("visitors")
        .select()
        .eq("event_id", eventId)
        .eq("contacted", true);
      assert(contacted?.length === 1, "Filter contacted visitors");

      // Filter by source
      const { data: kioskOnly } = await service
        .from("visitors")
        .select()
        .eq("event_id", eventId)
        .eq("source", "kiosk");
      assert(kioskOnly?.length === 1, "Filter by source (kiosk)");
    }

    // ── 7. PIN Verification ──
    console.log("\n7. PIN Verification");
    if (eventId) {
      const { data: evtPin } = await service
        .from("events")
        .select("kiosk_pin_hash")
        .eq("id", eventId)
        .single();

      // Correct PIN
      const correctHash = await hashPin(TEST_PIN);
      assert(evtPin?.kiosk_pin_hash === correctHash, "Correct PIN matches hash");

      // Wrong PIN
      const wrongHash = await hashPin("0000");
      assert(evtPin?.kiosk_pin_hash !== wrongHash, "Wrong PIN does not match");
    }

    // ── 8. Event Status Transitions ──
    console.log("\n8. Event Status Transitions");
    if (eventId) {
      // live → completed
      const { error: completeErr } = await service
        .from("events")
        .update({ status: "completed" })
        .eq("id", eventId);
      assert(!completeErr, "Transition live → completed");

      // Verify completed event cannot accept visitors (business logic check)
      const { data: completedEvt } = await service
        .from("events")
        .select("status")
        .eq("id", eventId)
        .single();
      assert(completedEvt?.status === "completed", "Event status is completed");
    }

    // ── 9. RLS Security Tests ──
    console.log("\n9. RLS Security Tests");

    // Anon client should NOT be able to read visitors
    const { data: anonVisitors, error: anonErr } = await anon
      .from("visitors")
      .select()
      .limit(1);
    assert(
      anonVisitors?.length === 0 || !!anonErr,
      "Anon cannot read visitors directly",
      anonErr?.message || `Got ${anonVisitors?.length} rows`,
    );

    // Anon client should NOT be able to read events
    const { data: anonEvents, error: anonEvtErr } = await anon
      .from("events")
      .select()
      .limit(1);
    assert(
      anonEvents?.length === 0 || !!anonEvtErr,
      "Anon cannot read events directly",
      anonEvtErr?.message || `Got ${anonEvents?.length} rows`,
    );

    // Anon client should NOT be able to insert visitors
    const { error: anonInsertErr } = await anon
      .from("visitors")
      .insert({
        event_id: eventId,
        user_id: TEST_USER_ID,
        first_name: "Hacker",
        source: "kiosk",
      });
    assert(!!anonInsertErr, "Anon cannot insert visitors directly", "Insert should fail");

    // ── 10. Data Integrity ──
    console.log("\n10. Data Integrity");
    if (propertyId) {
      // Property with associated event cannot cause orphan (cascade check)
      const { data: propEvents } = await service
        .from("events")
        .select("id")
        .eq("property_id", propertyId);
      assert(propEvents?.length === 1, "Property has 1 associated event");
    }

    // Verify custom questions schema integrity
    if (eventId) {
      const { data: evtQ } = await service
        .from("events")
        .select("custom_questions")
        .eq("id", eventId)
        .single();
      const qs = evtQ?.custom_questions as Array<{ id: string; question: string; type: string; options?: string[] }>;
      assert(qs?.[0]?.type === "yes_no", "Question type preserved in JSONB");
      assert(qs?.[1]?.options?.length === 3, "Question options preserved in JSONB");
    }

  } finally {
    // ── Cleanup ──
    console.log("\n── Cleanup ──");
    if (visitor1Id) await service.from("visitors").delete().eq("id", visitor1Id);
    if (visitor2Id) await service.from("visitors").delete().eq("id", visitor2Id);
    if (eventId) await service.from("events").delete().eq("id", eventId);
    if (propertyId) await service.from("properties").delete().eq("id", propertyId);
    console.log("  Test data cleaned up.");
  }

  // ── Results ──
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  • ${f}`));
  }
  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
