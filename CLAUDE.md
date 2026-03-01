# ShowReady

## Project Overview
Open house sign-in platform for real estate agents. QR/kiosk visitor capture, CRM sync (Cloze, FollowUpBoss, Zapier), AI photo staging via AiStaging, metered billing via SimplerPay.

- **Framework:** Next.js 16 + React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **Database:** PostgreSQL on Supabase (project ref: `fpxidztakgtofwjyqldt`)
- **Auth:** Supabase Auth (SSR cookies via @supabase/ssr)
- **Deployment:** Vercel
- **Version:** v0.1.7

## Architecture

### Folder Structure
```
src/
  app/                    # Next.js App Router
    (dashboard)/          # Authenticated dashboard pages
      events/             # Open house events
      properties/         # Property listings + AI staging UI
      integrations/       # CRM integration settings
    api/                  # API routes
      auth/cloze/         # Cloze OAuth flow
      cron/               # Scheduled jobs (CRM retry)
      events/             # Event CRUD
      health/             # Health check
      integrations/       # CRM sync endpoints
      kiosk/              # Public kiosk API
      media/              # AI staging/enhance/video routes
      properties/         # Property CRUD
      webhooks/aistaging/ # Webhook receiver for AI results
    kiosk/                # Public kiosk sign-in page
    login/                # Auth login page
  lib/                    # Core utilities
    aistaging-client.ts   # AiStaging v1 API client
    api-helpers.ts        # requireAuth(), apiError()
    auth-context.tsx      # React auth context (Google/Apple/Magic Link)
    billing/simplerpay.ts # SimplerPay billing client
    media/                # Media helpers (storage, aistaging-helpers)
    supabase-server.ts    # SSR + service client
    validations.ts        # Zod schemas
  hooks/                  # React hooks (useProperties, etc.)
  middleware.ts           # Route protection + token refresh
supabase/migrations/      # 6 migration files
```

### Key Integration Points
1. **AiStaging** (`aistaging.pro`) — AI photo staging, twilight, sky replace, declutter, upscale, video
2. **SimplerPay** (Simpler OS Supabase EF) — Metered billing for AI services
3. **Cloze CRM** — Contact sync via OAuth
4. **FollowUpBoss** — Contact sync via API key
5. **Zapier** — Webhook-based automation

### Auth & Middleware
- SSR-based with Supabase cookies (`@supabase/ssr`)
- Public routes: `/login`, `/signup`, `/auth/callback`, `/kiosk`, `/register`, `/report`, `/api/health`, `/api/kiosk`, `/api/register`, `/api/webhooks`
- All other routes require valid JWT session

### AI Staging Flow
```
User clicks photo → selects service → POST /api/media/stage
  → SimplerPay charge (idempotent) → AiStaging v1/process
  → AiStaging processes image → webhook POST /api/webhooks/aistaging
  → property_media updated → UI polls and shows result
```

### Billing (SimplerPay)
- Charge BEFORE AI processing (prevents free usage on billing failure)
- Auto-refund on processing failure via webhook handler
- Retail prices: staging $5, twilight $5, sky $3, declutter $3, upscale $1.50, video $12
- Auth: `x-app-key` header with `sk_showready_...` key

---

## Vercel Deployment

### Prerequisites
- Vercel account connected to GitHub repo
- ShowReady Supabase project (`fpxidztakgtofwjyqldt`) with migrations applied
- AiStaging deployed at `aistaging.pro`
- SimplerPay billing EF deployed on Simpler OS Supabase

### Environment Variables

All env vars must be set in Vercel Project Settings > Environment Variables.

| Variable | Value | Scope |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://fpxidztakgtofwjyqldt.supabase.co` | Client + Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ShowReady anon key (JWT) | Client + Server |
| `SUPABASE_SERVICE_ROLE_KEY` | ShowReady service role key (JWT) | Server only |
| `NEXT_PUBLIC_APP_URL` | Vercel production URL (e.g., `https://showready.vercel.app`) | Client + Server |
| `CREDENTIALS_ENCRYPTION_KEY` | 64-char hex string | Server only |
| `CLOZE_CLIENT_ID` | Cloze OAuth client ID | Server only |
| `CLOZE_CLIENT_SECRET` | Cloze OAuth client secret | Server only |
| `CRON_SECRET` | Random hex string for cron auth | Server only |
| `AI_STAGING_API_URL` | `https://aistaging.pro` | Server only |
| `CROSS_APP_API_KEY` | `07b6814e-9918-47c5-8e10-6ebdcb2946d9` | Server only |
| `SIMPLER_OS_SUPABASE_URL` | `https://dymrggoymetnvpaqowdb.supabase.co` | Server only |
| `SIMPLER_OS_APP_KEY` | `sk_showready_afe6cccc18c3dedd97bf2c17c7ade9f1` | Server only |
| `PROPERTY_SYNC_API_URL` | Railway MLS scraper URL (optional) | Server only |
| `PROPERTY_SYNC_API_KEY` | Railway API key (optional) | Server only |

### Deploy Steps
1. Connect GitHub repo to Vercel (`vercel` CLI or Vercel dashboard)
2. Set all env vars above in Vercel project settings
3. Set `NEXT_PUBLIC_APP_URL` to match the Vercel deployment URL
4. Deploy: `vercel --prod` or push to main branch
5. Verify: `https://<your-url>/api/health` should return `{ status: "ok" }`

### Post-Deploy Checklist
- [ ] Health endpoint responds
- [ ] Login page loads (Supabase Auth working)
- [ ] Webhook URL reachable: `https://<url>/api/webhooks/aistaging`
- [ ] Cloze OAuth callback configured: `https://<url>/api/auth/cloze/callback`
- [ ] Test AI staging: property → photo → stage → verify charge + result

### Supabase Auth Redirect URLs
After deploying, add the Vercel URL to Supabase Auth settings:
- Site URL: `https://<your-vercel-url>`
- Redirect URLs: `https://<your-vercel-url>/**`

---

## Database

### Supabase Project
- **Ref:** `fpxidztakgtofwjyqldt`
- **Region:** (check Supabase dashboard)

### Migrations (6 total)
1. `001_initial_schema.sql` — Core tables (teams, properties, events, visitors, media, etc.)
2. `002_rls_performance_fixes.sql` — Security & optimization
3. `003_increment_visitor_count.sql` — RPC function
4. `004_fix_rls_recursion.sql` — RLS policy fixes
5. `005_crm_sync_log_updated_at.sql` — Timestamp trigger
6. `006_aistaging_integration.sql` — AiStaging project linking columns

### Key Tables
- `properties` — Listings with `aistaging_project_id` link
- `property_media` — Photos + AI results (status: pending/processing/completed/failed)
- `events` — Open house events with PIN + custom questions
- `visitors` — Sign-in records from kiosk/QR/manual/import
- `crm_integration_log` — Sync tracking

---

## Conventions

### Naming
| Element | Pattern |
|---------|---------|
| Components | PascalCase |
| Utilities | camelCase |
| API Routes | kebab-case dirs |

### Error Handling
- `requireAuth()` returns `{ user, supabase, error }` — check error first
- `apiError(message, status)` for standard API error responses
- `createServiceClient()` for admin operations (bypasses RLS)

### Version Bumping
Every git push bumps patch version +0.0.1 in package.json.
