-- ============================================
-- ShowReady Initial Schema
-- ============================================

-- Teams (brokerages/offices)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  branding JSONB DEFAULT '{}',
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team members
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  role TEXT DEFAULT 'agent' CHECK (role IN ('owner', 'admin', 'agent')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- Properties listed for open house
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  team_id UUID REFERENCES teams(id),
  address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  zip TEXT,
  beds INTEGER,
  baths NUMERIC(3,1),
  sqft INTEGER,
  price NUMERIC(12,2),
  mls_number TEXT,
  photos JSONB DEFAULT '[]',
  tour_video_url TEXT,
  listing_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Property media assets (staged images, videos, etc.)
CREATE TABLE property_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('original', 'staged', 'twilight', 'sky', 'declutter', 'upscale', 'video')),
  url TEXT NOT NULL,
  room_type TEXT,
  ai_service TEXT,
  cost_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Open house events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  team_id UUID REFERENCES teams(id),
  property_id UUID REFERENCES properties(id),
  name TEXT NOT NULL,
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'completed')),
  kiosk_pin_hash TEXT,
  qr_code_url TEXT,
  custom_questions JSONB DEFAULT '[]',
  welcome_message TEXT,
  thank_you_message TEXT,
  branding JSONB DEFAULT '{}',
  visitor_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Visitors who signed in at events
CREATE TABLE visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  answers JSONB DEFAULT '{}',
  source TEXT DEFAULT 'kiosk' CHECK (source IN ('kiosk', 'qr', 'manual', 'import')),
  contacted BOOLEAN DEFAULT FALSE,
  priority BOOLEAN DEFAULT FALSE,
  notes TEXT,
  crm_sync_status JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email templates for follow-up sequences
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  delay_hours INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Follow-up log
CREATE TABLE follow_up_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES email_templates(id),
  type TEXT NOT NULL CHECK (type IN ('email', 'sms', 'quicktag_export')),
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'failed', 'opened', 'clicked')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- CRM sync log
CREATE TABLE crm_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id),
  integration TEXT NOT NULL CHECK (integration IN ('cloze', 'fub', 'realscout', 'zapier')),
  action TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'retrying')),
  error_message TEXT,
  attempts INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seller reports
CREATE TABLE seller_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  report_url TEXT,
  visitor_count INTEGER,
  summary JSONB DEFAULT '{}',
  shared_with_seller BOOLEAN DEFAULT FALSE,
  shared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing link (points to Simpler OS billing_account)
CREATE TABLE billing_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  team_id UUID REFERENCES teams(id),
  simpler_os_billing_account_id TEXT NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'agent', 'pro', 'team', 'brokerage')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Local usage log (mirror of what's sent to Simpler OS)
CREATE TABLE usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  action TEXT NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  simpler_os_event_id TEXT,
  property_id UUID REFERENCES properties(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Integration credentials (encrypted)
CREATE TABLE integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  integration TEXT NOT NULL CHECK (integration IN ('cloze', 'fub', 'zapier')),
  auth_type TEXT NOT NULL CHECK (auth_type IN ('oauth', 'api_key')),
  credentials_encrypted TEXT NOT NULL,
  email TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, integration)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_events_user_date ON events(user_id, event_date DESC);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_visitors_event ON visitors(event_id);
CREATE INDEX idx_visitors_email ON visitors(email);
CREATE INDEX idx_properties_user ON properties(user_id);
CREATE INDEX idx_usage_log_user ON usage_log(user_id, created_at DESC);
CREATE INDEX idx_crm_sync_status ON crm_sync_log(status) WHERE status = 'retrying';

-- ============================================
-- RLS POLICIES
-- ============================================

-- Teams: owner + members can read, owner can modify
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams_select" ON teams FOR SELECT USING (
  owner_id = auth.uid() OR
  id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "teams_insert" ON teams FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "teams_update" ON teams FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "teams_delete" ON teams FOR DELETE USING (owner_id = auth.uid());

-- Team members: team owner/admin can manage
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_members_select" ON team_members FOR SELECT USING (
  user_id = auth.uid() OR
  team_id IN (SELECT id FROM teams WHERE owner_id = auth.uid()) OR
  team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "team_members_insert" ON team_members FOR INSERT WITH CHECK (
  team_id IN (SELECT id FROM teams WHERE owner_id = auth.uid()) OR
  team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin'))
);
CREATE POLICY "team_members_delete" ON team_members FOR DELETE USING (
  team_id IN (SELECT id FROM teams WHERE owner_id = auth.uid()) OR
  user_id = auth.uid()
);

-- Properties: own + team
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "properties_all" ON properties FOR ALL USING (
  user_id = auth.uid() OR
  team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);

-- Property media: via property ownership
ALTER TABLE property_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "property_media_all" ON property_media FOR ALL USING (
  property_id IN (
    SELECT id FROM properties WHERE
      user_id = auth.uid() OR
      team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  )
);

-- Events: own + team
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_all" ON events FOR ALL USING (
  user_id = auth.uid() OR
  team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);

-- Visitors: via event ownership
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visitors_all" ON visitors FOR ALL USING (
  user_id = auth.uid() OR
  event_id IN (
    SELECT id FROM events WHERE
      user_id = auth.uid() OR
      team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  )
);

-- Email templates: own only
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_templates_all" ON email_templates FOR ALL USING (user_id = auth.uid());

-- Follow-up log: via visitor ownership
ALTER TABLE follow_up_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follow_up_log_all" ON follow_up_log FOR ALL USING (
  visitor_id IN (SELECT id FROM visitors WHERE user_id = auth.uid())
);

-- CRM sync log: via event ownership
ALTER TABLE crm_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_sync_log_select" ON crm_sync_log FOR SELECT USING (
  event_id IN (
    SELECT id FROM events WHERE
      user_id = auth.uid() OR
      team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  )
);

-- Seller reports: own only
ALTER TABLE seller_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller_reports_all" ON seller_reports FOR ALL USING (user_id = auth.uid());

-- Billing links: own only
ALTER TABLE billing_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_links_all" ON billing_links FOR ALL USING (user_id = auth.uid());

-- Usage log: own only
ALTER TABLE usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage_log_all" ON usage_log FOR ALL USING (user_id = auth.uid());

-- Integration credentials: own only
ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_credentials_all" ON integration_credentials FOR ALL USING (user_id = auth.uid());

-- Service role bypass for all tables (Edge Functions)
CREATE POLICY "service_role_teams" ON teams FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_team_members" ON team_members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_properties" ON properties FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_property_media" ON property_media FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_events" ON events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_visitors" ON visitors FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_email_templates" ON email_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_follow_up_log" ON follow_up_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_crm_sync_log" ON crm_sync_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_seller_reports" ON seller_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_billing_links" ON billing_links FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_usage_log" ON usage_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_integration_credentials" ON integration_credentials FOR ALL TO service_role USING (true) WITH CHECK (true);
