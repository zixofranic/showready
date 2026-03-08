# ShowReady — State of the Art

**Date:** 2026-03-08
**Version:** v0.1.16
**Repo:** https://github.com/zixofranic/showready.git (branch: master)

---

## What ShowReady Is

Open house sign-in platform for real estate agents. A tablet kiosk captures visitor info at open houses, syncs leads to CRMs in real-time, and provides QR codes for self-registration. Built for Simpler Real Estate (Louisville, KY).

**Stack:** Next.js 16 + React 19 + TypeScript + Tailwind + Supabase (project fpxidztakgtofwjyqldt)

---

## What's Working

### Event Management
- Full CRUD: create, list, update, delete events
- Status tracking: upcoming, live, completed
- Custom questions builder (up to 5 per event, types: text, select, multi-select, yes/no)
- Event PIN hashing (SHA-256) for kiosk exit
- Branding per event: welcome/thank you messages, logo, colors, media display mode

### Kiosk Sign-In (Tablet Mode)
- Public page at `/kiosk/[eventId]` — zero auth required
- Full-screen sign-in form (first name, last name, email, phone)
- Custom question responses captured
- Thank you screen with 30-second countdown (then reset)
- Photo slideshow with crossfade transitions (new in v0.1.16)
- Video background support
- PIN-protected operator exit
- Real-time visitor count increment

### QR Self-Registration
- Public page at `/register/[eventId]`
- Visitors scan QR code, fill form on their own phone
- Same data capture as kiosk (name, email, phone, custom questions)

### CRM Integrations (3 Providers + Retry)
- **Cloze CRM:** OAuth + API key fallback, creates persons, timeline entries, todos
- **FollowUpBoss:** API key auth, creates contacts, tags, notes
- **Zapier:** Webhook POST for custom automations
- All credentials AES-256 encrypted in `integration_credentials` table
- Fan-out on visitor sign-in: `Promise.allSettled` to all enabled CRMs
- Retry queue with exponential backoff (max 5 attempts)
- Cron endpoint `/api/cron/crm-retry` processes failed syncs

### Properties + MLS Photos
- Property CRUD (address, beds, baths, sqft, price, MLS number)
- MLS photo import from FlexMLS CDN
- SSRF prevention: allowlist for photo domains (sparkplatform.com, flexmls.com)
- Photos uploaded to Supabase Storage, user-scoped paths

### Authentication
- Google, Apple, Magic Link via Supabase Auth (SSR cookies)
- Middleware token refresh on every request
- Public routes exempted: `/login`, `/kiosk/*`, `/register/*`, `/api/health`

### Health Check
- `GET /api/health` returns `{ status: "ok", app: "showready", ts: ... }`

---

## What Was Stripped (v0.1.16 Decision)

The latest commit removed ~1,600 lines of cross-app integration code:

| Removed | What It Was | Why Removed |
|---------|-------------|-------------|
| AiStaging client | `lib/aistaging-client.ts` (235 LOC), 4 API routes (551 LOC), webhook handler (153 LOC) | Agents use AiStaging standalone; upload results manually |
| SimplerPay billing | `lib/billing/simplerpay.ts` (182 LOC), usage reporting | Agents manage billing via Simpler OS directly |
| Webhook handler | `/api/webhooks/aistaging` route | No async processing to track anymore |

**Implication:** ShowReady is now a focused sign-in + CRM tool. Photo staging and billing happen outside this app.

---

## What's Designed But Not Built

| Feature | Code Status | DB Tables | Design Doc |
|---------|------------|-----------|------------|
| Seller Reports (PDF for listing agent) | 0% | `seller_reports` exists | PLAN.md Section 5 |
| Email Follow-Up Sequences | 0% | `email_templates`, `follow_up_log` exist | PLAN.md Section 4 |
| My Media Gallery (cross-app) | 0% | None (needs EF-012 on Simpler OS) | CROSS_APP_INTEGRATION.md |
| Push Notifications | 0% | None | UX_ORCHESTRATOR_STUDY.md |
| Account Linking (AiStaging OAuth) | 0% | None | CROSS_APP_INTEGRATION.md Section 2 |
| Multi-Team Support | Tables exist, UI partial | `teams`, `team_members` | PLAN.md Section 6 |
| Billing Links to Simpler OS | 0% wiring | `billing_links`, `usage_log` exist | PLAN.md Section 7 |
| SendGrid Email Sending | Designed, not wired | — | CRM integration docs |

---

## Database Schema (13 Tables)

### Core Tables (All RLS-Enabled)

| Table | Rows | Purpose |
|-------|------|---------|
| `teams` | Multi-tenancy | Brokerage teams with branding |
| `team_members` | Team access | Maps users to teams (owner/admin/agent) |
| `properties` | Listings | Address, specs, MLS number, photos (JSONB) |
| `property_media` | Photos/video | Staged images, type tracking, before/after pairing |
| `events` | Open houses | Date, time, status, questions, branding, visitor count |
| `visitors` | Sign-in records | Name, email, phone, answers, CRM sync status |
| `integration_credentials` | CRM auth | AES-256 encrypted credentials per user per CRM |
| `crm_sync_log` | Audit trail | Per-visitor sync results with retry tracking |
| `email_templates` | Follow-ups | Email sequences (not yet wired) |
| `follow_up_log` | Delivery tracking | Email/SMS send results (not yet wired) |
| `seller_reports` | Reports | Generated reports for listing agents (not yet wired) |
| `billing_links` | Billing | ShowReady to Simpler OS account mapping (not yet wired) |
| `usage_log` | Usage tracking | Local mirror of billing events (not yet wired) |

### Migrations Applied (6)
1. `001_initial_schema.sql` — Core tables + RLS (311 LOC)
2. `002_rls_performance_fixes.sql` — Index + policy optimization
3. `003_increment_visitor_count.sql` — Atomic visitor count function
4. `004_fix_rls_recursion.sql` — Fix infinite recursion in team RLS
5. `005_crm_sync_log_updated_at.sql` — Add updated_at trigger
6. `006_aistaging_integration.sql` — Style, status, source_image_id columns on property_media

---

## API Routes (20+)

### Authenticated
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/events` | List, create events |
| PATCH | `/api/events/[id]` | Update event |
| DELETE | `/api/events/[id]` | Delete event |
| GET | `/api/events/[id]/visitors` | Visitor list for event |
| GET/POST | `/api/properties` | List, create properties |
| PATCH | `/api/properties/[id]` | Update property |
| DELETE | `/api/properties/[id]` | Delete property |
| GET | `/api/media/mls-import` | Import MLS photos |
| PATCH | `/api/visitors/[id]` | Update visitor (priority, notes) |
| GET | `/api/integrations/settings` | CRM integration settings |
| POST | `/api/integrations/cloze` | Save Cloze credentials |
| POST | `/api/integrations/fub` | Save FUB credentials |
| POST | `/api/integrations/zapier` | Save Zapier webhook |
| POST | `/api/integrations/*/test` | Test CRM connection |
| POST | `/api/auth/cloze/authorize` | Cloze OAuth redirect |
| GET | `/api/auth/cloze/callback` | Cloze OAuth callback |

### Public (No Auth)
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/kiosk/[eventId]` | Event info for tablet |
| POST | `/api/kiosk/[eventId]/verify-pin` | Validate kiosk PIN |
| GET | `/api/kiosk/[eventId]/visitors` | Live visitor count |
| POST | `/api/register/[eventId]` | QR self-registration submit |
| POST | `/api/cron/crm-retry` | Retry queue processor (CRON_SECRET) |
| GET | `/api/health` | Status check |

---

## Pages & Routes

### Authenticated (Dashboard)
| Route | Purpose |
|-------|---------|
| `/` | Redirect to `/events` |
| `/(dashboard)` | Main dashboard |
| `/(dashboard)/events` | Event list + create |
| `/(dashboard)/events/[id]` | Event detail + edit |
| `/(dashboard)/properties` | Property list |
| `/(dashboard)/properties/[id]` | Property detail + photos |
| `/(dashboard)/settings/integrations` | CRM integration toggles |

### Public
| Route | Purpose |
|-------|---------|
| `/login` | Sign-in (Google, Apple, Magic Link) |
| `/kiosk/[eventId]` | Tablet sign-in screen |
| `/register/[eventId]` | QR self-registration |

---

## Environment Variables Required

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://fpxidztakgtofwjyqldt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon JWT>
SUPABASE_SERVICE_ROLE_KEY=<service role JWT>

# App
NEXT_PUBLIC_APP_URL=https://showready.vercel.app

# Credential encryption (64-char hex)
CREDENTIALS_ENCRYPTION_KEY=<generated>

# Cloze OAuth
CLOZE_CLIENT_ID=<from Cloze>
CLOZE_CLIENT_SECRET=<from Cloze>

# Cron auth
CRON_SECRET=<random hex>

# MLS Import
PROPERTY_SYNC_API_URL=https://your-railway-api.up.railway.app
PROPERTY_SYNC_API_KEY=<Railway key>
```

---

## Codebase Stats

| Metric | Value |
|--------|-------|
| Total files | 61 TypeScript/TSX |
| Total LOC | ~4,500 |
| API routes | 20+ |
| DB tables | 13 |
| DB migrations | 6 (674 LOC) |
| UI components | 3 (EventQRCode, PhotoSlideshow, QuestionBuilder) |
| Automated tests | 0 |
| Dependencies | Next.js 16, React 19, Supabase, TanStack Query, Zustand, Zod, Tailwind 4 |

---

## Git History (Last 10 Commits)

```
889b880 feat: strip AiStaging integration + add photo slideshow to kiosk (v0.1.16)
d56cacb feat: kiosk & register visual redesign — property photos + MP4 video (v0.1.15)
f456979 fix: Cloze notes/todos via /createcontent + errorcode check (v0.1.14)
dfad2b4 fix: Cloze todo uses /timeline/todo/create with participants (v0.1.13)
0a5938d fix: Cloze API endpoints aligned with working apps (v0.1.12)
6a588dc fix: CRM push uses after() to survive Vercel serverless shutdown (v0.1.11)
...
e44ccb0 feat: Phase B — AiStaging client, webhook, media routes, staging UI (v0.1.7)
880b859 fix: remove duplicated AiStaging internals, add cross-app design doc (v0.1.6)
```

---

## CTO-Identified Risks (From CTO_UX_REVIEW.md)

| Risk | Severity | Status |
|------|----------|--------|
| Push notifications unreliable on web (iPad) | HIGH | Not started — recommend polling + email v1 |
| Re-stage limit not enforced | HIGH | Should be on AiStaging side (3 free, then $5) |
| Address normalization for cross-app queries | MEDIUM | No shared utility yet |
| Before/after slider needs schema columns | MEDIUM | Fixed in migration 006 |
| Refund mechanism missing | MEDIUM | SimplerPay EF needs refund tool |
| Webhook replay protection | LOW | HMAC signature recommended |

---

## Design Documents (Untracked)

4 comprehensive docs in `Docs/` (~265 KB total):

| Document | Size | Content |
|----------|------|---------|
| `OPEN_HOUSE_PLATFORM_PLAN.md` | 110 KB | Full product strategy, 7 phases, every feature spec |
| `CROSS_APP_INTEGRATION.md` | 24 KB | AiStaging API contract, service team pattern, pricing |
| `UX_ORCHESTRATOR_STUDY.md` | 91 KB | Myra's UX analysis, screen flows, interaction design |
| `CTO_UX_REVIEW.md` | 32 KB | Joe's technical feasibility review, risk assessment |
| `CTO_RISK_ASSESSMENT.md` | ~8 KB | Follow-up answers on re-staging, pricing, limits |

---

## Key Architectural Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-207 | ShowReady is a separate Next.js app | Own Supabase project, own auth, own tables, own RLS |
| D-209 | AiStaging is external (not embedded) | Agents use AiStaging standalone, reduced coupling |
| D-210 | SimplerPay billing lives in Simpler OS | One consolidated invoice per brokerage |
| D-211 | CRM fan-out with retry | Promise.allSettled, failures don't block, exponential backoff |

---

## What's Next (Candidates)

**Ready to build (tables exist, design done):**
1. Seller Reports — PDF generation, sharing with listing agent
2. Email follow-up sequences — automated drip after open house
3. Multi-team support — wire existing tables into UI

**Needs external work first:**
4. My Media Gallery — requires Media Registry EF on Simpler OS
5. Push notifications — needs PWA setup for iPad reliability
6. Account linking — only needed when AiStaging re-integration happens

**Production readiness gaps:**
- Zero automated tests
- No error tracking (Sentry)
- No analytics
- Design docs not committed to git
