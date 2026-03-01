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

## 5. Layer 3: Account Linking (Future — NOT built now)

### 5.1 When to Build

Build when agents ask to:
- Re-stage the same photo with a different style without re-paying
- Access their ShowReady-generated media in AiStaging's full UI
- Use AiStaging's advanced features (custom prompts, seeds, batch processing) on ShowReady photos

### 5.2 How It Would Work

1. AiStaging adds OAuth Provider endpoints (`/oauth/authorize`, `/oauth/token`)
2. ShowReady adds "Link AiStaging" button in settings (same as existing "Connect Cloze")
3. After linking, ShowReady creates properties under the agent's own AiStaging account (not service team)
4. Agent sees everything in their AiStaging dashboard
5. Re-staging is free (no duplicate charge — SimplerPay already paid)

### 5.3 What Changes When Account Linking Ships

- New properties go under agent's account (not service team)
- Existing service team properties stay as-is (no migration needed)
- Service team pattern remains as fallback for unlinked agents

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
| 6 | Agent wants to re-stage with different style | Through ShowReady: pays again via SimplerPay (same photo, new style = new work). Through AiStaging (future, with account linking): can re-stage under their own account. |
| 7 | Agent wants staged image in PropIQ | PropIQ queries media registry by agent email + property address → gets all staged images. |
| 8 | Agent wants to download staged image | ShowReady shows download button. URL is public. |
| 9 | Property address changes in ShowReady | AiStaging copy is stale (acceptable — media processing doesn't need current address). |
| 10 | Two agents stage same address | Each gets their own service team property (different ShowReady property IDs in metadata). |

---

## 10. Build Order

### Phase A: AiStaging Service API (Layer 1)
1. Create service user + service team (manual, one-time)
2. Build `POST /api/v1/projects`
3. Build `POST /api/v1/process`
4. Build `POST /api/v1/render`
5. Test each endpoint with curl

### Phase B: ShowReady Client + Webhook (Layer 1)
1. Migration: add `aistaging_project_id` to properties
2. Build `src/lib/aistaging-client.ts`
3. Build `POST /api/webhooks/aistaging`
4. Build `POST /api/media/stage` (SimplerPay → AiStaging → webhook → property_media)
5. Build `POST /api/media/enhance` (same pattern for 5 other services)
6. Build `POST /api/media/video` (render endpoint)
7. Test: MLS import → stage kitchen → verify webhook → verify property_media

### Phase C: Media Registry (Layer 2)
1. Migration: create `media_assets` table on Simpler OS
2. Build `media-registry` Edge Function (4 tools)
3. Wire ShowReady webhook handler to register assets after save
4. Test: stage image → verify it appears in media registry
5. Wire PropIQ to query media registry (optional, future)

### Phase D: Account Linking (Layer 3 — Future)
- Only when agents need re-staging across apps
- Build OAuth provider on AiStaging
- Build "Link AiStaging" in ShowReady settings
- Migrate new properties to agent's account (service team = fallback for unlinked)

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

- No SSO (future, not now)
- No shared property database between apps
- No Remotion Player in ShowReady (videos are MP4s)
- No direct Decor8/Replicate API calls from ShowReady
- No email-based user lookup across apps
- No auto-provisioning of AiStaging accounts
- No property sync between apps
