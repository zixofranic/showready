# Cross-App Integration Design — ShowReady ↔ AiStaging ↔ Platform

**Date:** 2026-03-01
**Status:** Design phase — NO code until this doc is approved
**Decision refs:** D-207, D-209, D-210, D-211

---

## 1. Problem Statement

ShowReady needs AI media services (staging, twilight, sky replace, declutter, upscale, tour video). AiStaging already provides all of these. The agent pays once and expects to use the result everywhere — ShowReady, AiStaging, PropIQ, email, social.

**Core principle: Paid once = available everywhere, forever.**

---

## 2. Architecture Overview

Three layers, built in order:

```
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 1: Service API                      │
│         AiStaging processes media for ShowReady              │
│         (Service Team pattern, x-api-key auth)               │
│                                                              │
│   ShowReady ──POST /api/v1/projects──→ AiStaging             │
│   ShowReady ──POST /api/v1/process───→ AiStaging             │
│   ShowReady ──POST /api/v1/render────→ AiStaging             │
│   AiStaging ──POST /api/webhooks/────→ ShowReady (results)   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   LAYER 2: Media Registry                    │
│     Simpler OS platform tracks all paid media assets         │
│     Any app registers assets, any app queries them           │
│                                                              │
│   ShowReady ──register_asset──→ Simpler OS media-registry    │
│   PropIQ   ──list_assets─────→ Simpler OS media-registry     │
│   AiStaging ──register_asset──→ Simpler OS media-registry    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│               LAYER 3: Account Linking (Future)              │
│     Agent links AiStaging account inside ShowReady           │
│     (OAuth, like RealScout + Cloze)                          │
│     Enables: re-staging, style changes, full AiStaging UI    │
│                                                              │
│     NOT built now — built when agents need re-staging        │
└─────────────────────────────────────────────────────────────┘
```

**Build order:** Layer 1 → Layer 2 → Layer 3

---

## 3. Layer 1: Service API (AiStaging endpoints)

### 3.1 Service Team Setup (one-time, manual)

AiStaging's `properties` table requires `team_id NOT NULL` and `created_by` referencing `auth.users`. To create properties via API without a real user:

1. Create a service user in AiStaging's Supabase Auth (never logs in)
2. Create a "ShowReady Service" team owned by that user
3. Store as env vars on AiStaging:
   - `SHOWREADY_SERVICE_TEAM_ID` — the team UUID
   - `SHOWREADY_SERVICE_USER_ID` — the service user UUID

All ShowReady-created properties live under this team. Agent's personal AiStaging properties (if any) are in different teams — no conflict, no unique constraint violation.

### 3.2 Endpoint: POST /api/v1/projects

**Purpose:** Create or find a linked property in AiStaging, import photos.

**Auth:** `x-api-key` header (shared `CROSS_APP_API_KEY`)

**Request:**
```json
{
  "address": "123 Main St, Louisville, KY 40202",
  "photos": [
    { "url": "https://fpxidz...supabase.co/storage/.../photo1.jpg", "caption": "Kitchen", "room_type": "kitchen" },
    { "url": "https://fpxidz...supabase.co/storage/.../photo2.jpg", "caption": "Living Room", "room_type": "living_room" }
  ],
  "showready_property_id": "uuid-from-showready",
  "callback_url": "https://showready.app/api/webhooks/aistaging",
  "agent_email": "jane@simplerre.com"
}
```

**Logic:**
1. Validate `x-api-key`
2. Normalize address: `address.toLowerCase().trim()`
3. Check existing: `SELECT * FROM properties WHERE team_id = SERVICE_TEAM_ID AND address_normalized = ?`
4. If found → update callback_url/metadata if changed, return existing ID
5. If not found → create property under service team, import photos using existing `import-url` logic
6. Store in metadata: `{ showready_property_id, showready_callback_url, agent_email, source: "showready" }`

**Response (201 created / 200 existing):**
```json
{
  "aistaging_project_id": "uuid",
  "created": true,
  "photos_imported": 12,
  "photos_failed": 0
}
```

**Edge cases:**
- Race condition on create → catch unique constraint (23505), re-query, return existing
- Photos fail to import → partial success is OK, return counts
- Property already exists with same address → return it, don't duplicate

### 3.3 Endpoint: POST /api/v1/process

**Purpose:** Trigger AI processing on an image in the service team project.

**Auth:** `x-api-key` header

**Request:**
```json
{
  "project_id": "aistaging-property-uuid",
  "image_id": "aistaging-asset-uuid",
  "service": "staging",
  "options": {
    "room_type": "kitchen",
    "design_style": "modern"
  }
}
```

**Services supported:** `staging`, `twilight`, `sky`, `declutter`, `upscale`, `sky_lighting`

**Logic:**
1. Validate `x-api-key`
2. Verify project exists in service team
3. Verify image (asset) exists in project
4. **Skip credit charging** — ShowReady already charged via SimplerPay
5. Call existing AiStaging processing logic (Decor8/Replicate)
6. Save result asset to AiStaging's assets table
7. Upload result to AiStaging's storage
8. POST result to callback_url from property metadata

**Response (200):**
```json
{
  "job_id": "uuid",
  "status": "completed",
  "result_url": "https://aistaging-storage.../staged_kitchen.jpg",
  "processing_time_ms": 12500,
  "asset_id": "new-asset-uuid"
}
```

**Webhook callback (POST to callback_url):**
```json
{
  "showready_property_id": "uuid",
  "job_id": "uuid",
  "service": "staging",
  "results": [
    {
      "url": "https://aistaging-storage.../staged_kitchen.jpg",
      "asset_id": "uuid",
      "room_type": "kitchen",
      "style": "modern"
    }
  ]
}
```

### 3.4 Endpoint: POST /api/v1/render

**Purpose:** Trigger video rendering via Remotion Lambda.

**Auth:** `x-api-key` header

**Request:**
```json
{
  "project_id": "aistaging-property-uuid",
  "template": "property-tour",
  "config": {
    "agent_name": "Jane Smith",
    "agent_logo_url": "https://...",
    "brokerage_name": "Simpler Real Estate",
    "property_address": "123 Main St",
    "slides": [
      { "image_url": "https://...", "caption": "Kitchen", "duration": 3 },
      { "image_url": "https://...", "caption": "Living Room", "duration": 3 }
    ]
  }
}
```

**Logic:**
1. Validate `x-api-key`
2. Verify project exists in service team
3. Call existing Remotion Lambda render pipeline
4. POST MP4 URL to callback_url when render completes

**Response (202 accepted):**
```json
{
  "job_id": "uuid",
  "status": "rendering",
  "estimated_seconds": 45
}
```

**Webhook callback (POST to callback_url when done):**
```json
{
  "showready_property_id": "uuid",
  "job_id": "uuid",
  "service": "video",
  "results": [
    {
      "url": "https://aistaging-storage.../tour_video.mp4",
      "asset_id": "uuid",
      "duration_seconds": 15
    }
  ]
}
```

### 3.5 Billing Flow

```
Agent clicks "Stage Kitchen" in ShowReady
    │
    ├─1─→ ShowReady charges SimplerPay ($5 staging)
    │     (charge-before-service, idempotency key)
    │
    ├─2─→ ShowReady calls AiStaging /api/v1/process
    │     (x-api-key auth — AiStaging skips its own credit charge)
    │
    ├─3─← AiStaging processes, webhooks result back
    │
    ├─4─→ ShowReady saves URL to property_media
    │
    └─5─→ ShowReady registers asset in media registry (Layer 2)
```

**Key rule:** `x-api-key` auth = SimplerPay billing. Supabase Auth = AiStaging credits. Never both.

### 3.6 Retail Pricing (SimplerPay)

| Service | COGS | Retail Price | Margin % | vs BoxBrownie |
|---------|------|-------------|----------|---------------|
| Staging (1 photo) | $0.22 | **$5.00** | 95.6% | $16-32 |
| Twilight (1 photo) | $0.22 | **$5.00** | 95.6% | $24-48 |
| Sky Replace (1 photo) | $0.22 | **$3.00** | 92.7% | $4-8 |
| Declutter (1 photo) | $0.22 | **$3.00** | 92.7% | $8-16 |
| Upscale (1 photo) | $0.06 | **$1.50** | 96.0% | N/A |
| Tour Video (up to 12 photos) | $0.11 | **$12.00** | 99.1% | N/A |

Update `AI_COSTS` → `RETAIL_PRICES` in `src/lib/billing/simplerpay.ts`.

At 50 agents, 70% adoption: ~$4,000/month gross profit from a single brokerage.

### 3.7 Webhook Retry (Non-negotiable)

AiStaging MUST implement webhook retry with exponential backoff:
- 3 retries: immediate, +30s, +2min
- ShowReady polling fallback: if no webhook in 60s, poll `/api/v1/status/:jobId` every 10s for up to 5min
- After 5min with no result: auto-refund via SimplerPay, mark as failed
- Log every webhook attempt and response on both sides

This is the #1 reliability concern. Agent pays $5, sees nothing = trust destroyed permanently.

---

## 4. Layer 2: Media Registry (Simpler OS)

### 4.1 Purpose

Central registry of all AI-generated media across the platform. Any app registers assets, any app queries them. Agent identifier is email (same as SimplerPay).

### 4.2 Edge Function: `media-registry` (EF-012)

Deployed on Simpler OS Supabase: `https://dymrggoymetnvpaqowdb.supabase.co/functions/v1/media-registry`

**Auth:** `x-app-key` header (same pattern as SimplerPay)

**Tools:**

#### register_asset
```json
{
  "tool": "register_asset",
  "arguments": {
    "user_email": "jane@simplerre.com",
    "source_app": "showready",
    "source_asset_id": "uuid-in-source-app",
    "asset_type": "staged",
    "url": "https://aistaging-storage.../staged_kitchen.jpg",
    "thumbnail_url": "https://...",
    "property_address": "123 Main St, Louisville, KY 40202",
    "room_type": "kitchen",
    "style": "modern",
    "billing_ref": "staging_uuid_2026-03-01",
    "metadata": {}
  }
}
```

#### list_assets
```json
{
  "tool": "list_assets",
  "arguments": {
    "user_email": "jane@simplerre.com",
    "property_address": "123 Main St",
    "asset_type": "staged",
    "limit": 50
  }
}
```
Returns array of assets. All filters optional except `user_email`.

#### get_asset
```json
{
  "tool": "get_asset",
  "arguments": {
    "asset_id": "uuid"
  }
}
```

#### delete_asset
```json
{
  "tool": "delete_asset",
  "arguments": {
    "asset_id": "uuid",
    "source_app": "showready"
  }
}
```
Only the source app can delete its own assets.

### 4.3 Database Table: `media_assets`

```sql
CREATE TABLE media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  source_app TEXT NOT NULL,
  source_asset_id TEXT,
  asset_type TEXT NOT NULL CHECK (asset_type IN (
    'original', 'staged', 'twilight', 'sky', 'declutter', 'upscale', 'video'
  )),
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  property_address TEXT,
  room_type TEXT,
  style TEXT,
  billing_ref TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_media_user_date ON media_assets(user_email, created_at DESC);
CREATE INDEX idx_media_user_address ON media_assets(user_email, property_address);
CREATE INDEX idx_media_source ON media_assets(source_app, source_asset_id);
```

### 4.4 Who Registers What

| App | When | What gets registered |
|-----|------|---------------------|
| ShowReady | After receiving AiStaging webhook | Staged images, twilight, sky, declutter, upscale, videos |
| AiStaging | After generating any asset (optional, future) | Same asset types |
| PropIQ | Not a producer — queries only | N/A |

### 4.5 Who Queries What

| App | When | What they query |
|-----|------|----------------|
| ShowReady | Property media gallery | All assets for this property address |
| PropIQ | CMA property page | Staged images for this address |
| AiStaging | Dashboard (optional, future) | Show "assets from other apps" |
| Future apps | Any property-related view | All assets for this agent + address |

---

## 5. Re-staging Limits

### 5.1 Policy: 3 Free Re-stages Per Original

At $5.00 retail / $0.20 cost, 3 re-stages costs us $0.60, leaving $4.20 margin (84%).

- **First staging:** $5.00 via SimplerPay (new photo, new work)
- **Re-stages 1-3:** Free (same photo, different style)
- **Re-stage 4+:** $5.00 again (treated as new staging, resets counter)

### 5.2 Enforcement (AiStaging-side)

Enforcement lives in AiStaging's `/api/v1/process`, NOT ShowReady. The processing engine is the single point of control — prevents bypass from other apps.

```sql
-- On AiStaging database
ALTER TABLE assets ADD COLUMN IF NOT EXISTS restage_count INTEGER DEFAULT 0;
```

Logic in `/api/v1/process`:
1. Receive request with `image_id` + `design_style`
2. Walk up `original_asset_id` chain to find root original
3. Check `restage_count` on root: if >= 3, return 429 with limit info
4. Process image, increment counter on root
5. Return result with `restages_remaining` in response

### 5.3 ShowReady UX

- Button shows: "Re-stage (Free, 2 remaining)" or "Re-stage ($5.00)" when exhausted
- Re-staging at $5.00 creates a new staging job with a fresh 3-restage counter

---

## 6. Layer 3: Account Linking (Email Verification — Phase D)

### 6.1 When to Build

Build when agents explicitly ask for:
- AiStaging full UI access to ShowReady photos (custom prompts, batch processing)
- Direct editing of staged photos in AiStaging's web interface

**NOTE:** Re-staging does NOT require account linking — it's handled by the Service API + restage counter (Section 5).

### 6.2 How It Works (Email Verification, NOT OAuth)

1. Agent clicks "Link AiStaging" in ShowReady settings
2. ShowReady sends a one-time 6-digit code to the agent's email
3. Agent enters code in ShowReady
4. ShowReady stores `aistaging_linked = true` and `aistaging_user_email` in agent's profile
5. Future projects created under agent's AiStaging account (not service team)
6. Agent logs into aistaging.pro with same email → sees ShowReady projects

**Why email verification, not OAuth:**
- 50 lines of code vs 2-3 weeks of OAuth infrastructure
- 93% success rate vs 75% (no token refresh failures, no Safari redirect bugs)
- No consent screens, no redirect flows, no client_id/secret rotation
- Email mismatch is caught immediately (code goes to wrong inbox)

### 6.3 What Changes When Linking Ships

- Linked agents: projects go under their AiStaging account
- Unlinked agents: service team pattern continues (no change)
- Existing service team projects stay as-is (no migration)

---

## 6. ShowReady-Side Changes

### 6.1 Database Migration

```sql
-- Add AiStaging link to properties
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS aistaging_project_id UUID;
```

### 6.2 New Files

| File | Purpose |
|------|---------|
| `src/lib/aistaging-client.ts` | Thin HTTP client: `ensureProject()`, `processImage()`, `renderVideo()` |
| `src/app/api/webhooks/aistaging/route.ts` | Receives results from AiStaging, saves to property_media |
| `src/app/api/media/stage/route.ts` | Agent-facing proxy: SimplerPay charge → AiStaging API → register in media registry |
| `src/app/api/media/enhance/route.ts` | Same pattern for twilight/sky/declutter/upscale |
| `src/app/api/media/video/route.ts` | Same pattern for tour video rendering |

### 6.3 aistaging-client.ts API

```typescript
// Ensure a linked project exists in AiStaging (lazy creation)
ensureProject(address, showreadyPropertyId, callbackUrl, agentEmail, photos?)
  → { aistagingProjectId, created }

// Trigger AI processing
processImage(projectId, imageId, service, options)
  → { jobId, status }

// Trigger video rendering
renderVideo(projectId, template, config)
  → { jobId, status, estimatedSeconds }
```

### 6.4 Webhook Handler

`POST /api/webhooks/aistaging` receives results and:
1. Validates `x-api-key`
2. Looks up ShowReady property by `showready_property_id` from payload
3. Inserts into `property_media` table (type, url, room_type, style)
4. Registers asset in media registry (Layer 2)

### 6.5 Video Playback

Videos are pre-rendered MP4s (D-207). ShowReady plays them with a standard `<video>` tag reading the URL from `property_media`. No Remotion Player needed.

---

## 7. AiStaging-Side Changes

### 7.1 New Files

| File | Purpose |
|------|---------|
| `app/api/v1/projects/route.ts` | Create/find linked property, import photos |
| `app/api/v1/process/route.ts` | Wrap existing 6 AI routes with x-api-key auth |
| `app/api/v1/render/route.ts` | Wrap existing Remotion Lambda with x-api-key auth |

### 7.2 Existing Files Modified

| File | Change |
|------|--------|
| `lib/api-key-auth.ts` | No change needed (already validates x-api-key) |
| Processing routes (staging, twilight, etc.) | **No changes** — v1/process calls them internally |

### 7.3 Environment Variables (new)

```
SHOWREADY_SERVICE_TEAM_ID=<uuid>
SHOWREADY_SERVICE_USER_ID=<uuid>
```

---

## 8. Simpler OS Changes

### 8.1 New Edge Function: media-registry

| File | Purpose |
|------|---------|
| `supabase/functions/media-registry/index.ts` | 4 tools: register, list, get, delete |
| Migration for `media_assets` table | See Section 4.3 |

### 8.2 Auth

Same `x-app-key` pattern as SimplerPay billing. Already built.

---

## 9. Scenarios Matrix

| # | Scenario | What Happens |
|---|----------|-------------|
| 1 | Agent has AiStaging + same property | Service team creates separate record (different team = no conflict). Agent's personal AiStaging property untouched. Media registry makes results available everywhere. |
| 2 | Agent has AiStaging, no property yet | Create under service team. Agent's AiStaging account not involved. |
| 3 | Agent has NO AiStaging account | Same flow. No account provisioning. Service team owns it. |
| 4 | Agent signs up for AiStaging later | Zero reconciliation. Service team property is for ShowReady. Media registry shows assets in any app. |
| 5 | Different emails across apps | Not our problem. Media registry uses ShowReady's email. Agent sees their media in ShowReady. |
| 6 | Agent wants to re-stage with different style | 3 free re-stages per original via Service API (no account linking needed). After 3: pays $5 again (new staging, fresh counter). With account linking (Phase D): unlimited via AiStaging web UI. |
| 7 | Agent wants staged image in PropIQ | PropIQ queries media registry by agent email + property address → gets all staged images. |
| 8 | Agent wants to download staged image | ShowReady shows download button. URL is public. |
| 9 | Property address changes in ShowReady | AiStaging copy is stale (acceptable — media processing doesn't need current address). |
| 10 | Two agents stage same address | Each gets their own service team property (different ShowReady property IDs in metadata). |

---

## 10. Build Order

### Phase A: AiStaging Service API (Layer 1) — Week 1-2
1. **Manual:** Create service user + service team in AiStaging Supabase Auth, set env vars
2. Build `POST /api/v1/projects` (create/find property, import photos)
3. Build `POST /api/v1/process` (wrap existing AI routes + restage counter + webhook retry)
4. Build `POST /api/v1/render` (wrap Remotion Lambda)
5. Build `GET /api/v1/health` (Decor8 + Replicate + Lambda reachability)
6. Build `GET /api/v1/status/:jobId` (polling fallback for lost webhooks)
7. Build `refund_usage` tool on SimplerPay billing Edge Function (Simpler OS)
8. Update `AI_COSTS` → `RETAIL_PRICES` in ShowReady's `simplerpay.ts`
9. Test: curl all endpoints

### Phase B: ShowReady Client + Webhook (Layer 1) — Week 3-4
1. Migration: add columns to `property_media` (style, status, source_image_id, aistaging_asset_id, aistaging_job_id, billing_ref)
2. Migration: add `aistaging_project_id` to properties
3. Build `src/lib/aistaging-client.ts` (ensureProject, processImage, renderVideo, checkStatus)
4. Build `POST /api/webhooks/aistaging` (receive results, update property_media, handle failures + auto-refund)
5. Build `POST /api/media/stage` (SimplerPay charge → AiStaging call)
6. Build `POST /api/media/enhance` (same pattern for twilight/sky/declutter/upscale)
7. Build `POST /api/media/video` (render endpoint)
8. Build staging UI (modal flow, processing badges via Supabase Realtime, before/after slider)
9. Test: end-to-end with 10 test properties, 3 real agents

### Phase C: Media Registry + My Media (Layer 2) — Week 5-6
Only start after 30+ days of Phase B real agent usage.
1. Migration: create `media_assets` table on Simpler OS (add `original_url TEXT` as first-class column)
2. Build `media-registry` Edge Function (4 tools: register, list, get, delete)
3. Build shared `normalizeAddress()` utility (used by all apps)
4. Wire ShowReady webhook handler to register assets after save
5. Build My Media gallery on simpleros.com (full Myra design: 4 filters, search, grid, detail modal)
6. Test: stage in ShowReady → appears in My Media within 10 seconds
7. Wire PropIQ to query media registry (when PropIQ exists)

### Phase D: Account Linking (Layer 3 — Future, email verification)
Only when agents explicitly ask for AiStaging full UI access. NOT needed for re-staging.
1. Build email verification flow (6-digit code, 50 lines)
2. Add "Link AiStaging" in ShowReady settings
3. Switch linked agents from service team to personal AiStaging account
4. Service team remains fallback for unlinked agents

---

## 11. Environment Variables Summary

### AiStaging (new)
```
SHOWREADY_SERVICE_TEAM_ID=<uuid>
SHOWREADY_SERVICE_USER_ID=<uuid>
# CROSS_APP_API_KEY already exists (PropIQ uses it)
```

### ShowReady (updated)
```
AI_STAGING_API_URL=https://aistaging.pro
CROSS_APP_API_KEY=<shared-secret>
# SIMPLER_OS_SUPABASE_URL already exists
# SIMPLER_OS_APP_KEY already exists
```

### Simpler OS
```
# No new env vars — uses existing x-app-key auth
```

---

## 12. What NOT to Build

- No OAuth for account linking (use email verification instead — 50 lines vs 2-3 weeks)
- No SSO across apps (future, not now)
- No shared property database between apps
- No Remotion Player in ShowReady (videos are MP4s)
- No direct Decor8/Replicate API calls from ShowReady
- No email-based user lookup across apps
- No auto-provisioning of AiStaging accounts
- No property sync between apps
- No countdown timer in processing UI (use "Usually under 30 seconds")
- No cancel button during processing (Decor8 jobs can't be cancelled mid-flight)
- No push notifications for v1 (use Supabase Realtime + email fallback)
