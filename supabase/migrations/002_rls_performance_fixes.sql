-- Performance fix: wrap auth.uid() in (select ...) to prevent per-row re-evaluation
-- CTO review recommendation applied 2026-02-28

-- Drop and recreate user-facing RLS policies with (select auth.uid()) optimization

-- team_members
DROP POLICY IF EXISTS "Users see own memberships" ON team_members;
CREATE POLICY "Users see own memberships" ON team_members
  FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users manage own membership" ON team_members;
CREATE POLICY "Users manage own membership" ON team_members
  FOR ALL USING (user_id = (select auth.uid()));

-- properties
DROP POLICY IF EXISTS "Users see own properties" ON properties;
CREATE POLICY "Users see own properties" ON properties
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users manage own properties" ON properties;
CREATE POLICY "Users manage own properties" ON properties
  FOR ALL USING (
    user_id = (select auth.uid())
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()) AND role IN ('owner','admin'))
  );

-- property_media
DROP POLICY IF EXISTS "Users see own property media" ON property_media;
CREATE POLICY "Users see own property media" ON property_media
  FOR SELECT USING (
    property_id IN (
      SELECT id FROM properties WHERE user_id = (select auth.uid())
      UNION
      SELECT id FROM properties WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users manage own property media" ON property_media;
CREATE POLICY "Users manage own property media" ON property_media
  FOR ALL USING (
    property_id IN (
      SELECT id FROM properties WHERE user_id = (select auth.uid())
      UNION
      SELECT id FROM properties WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()) AND role IN ('owner','admin'))
    )
  );

-- events
DROP POLICY IF EXISTS "Users see own events" ON events;
CREATE POLICY "Users see own events" ON events
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users manage own events" ON events;
CREATE POLICY "Users manage own events" ON events
  FOR ALL USING (
    user_id = (select auth.uid())
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()) AND role IN ('owner','admin'))
  );

-- visitors
DROP POLICY IF EXISTS "Users see own visitors" ON visitors;
CREATE POLICY "Users see own visitors" ON visitors
  FOR SELECT USING (
    event_id IN (
      SELECT id FROM events WHERE user_id = (select auth.uid())
      UNION
      SELECT id FROM events WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users manage own visitors" ON visitors;
CREATE POLICY "Users manage own visitors" ON visitors
  FOR ALL USING (
    event_id IN (
      SELECT id FROM events WHERE user_id = (select auth.uid())
      UNION
      SELECT id FROM events WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()) AND role IN ('owner','admin'))
    )
  );

-- email_templates
DROP POLICY IF EXISTS "Users see own templates" ON email_templates;
CREATE POLICY "Users see own templates" ON email_templates
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users manage own templates" ON email_templates;
CREATE POLICY "Users manage own templates" ON email_templates
  FOR ALL USING (user_id = (select auth.uid()));

-- follow_up_log
DROP POLICY IF EXISTS "Users see own follow-ups" ON follow_up_log;
CREATE POLICY "Users see own follow-ups" ON follow_up_log
  FOR SELECT USING (
    visitor_id IN (
      SELECT v.id FROM visitors v
      JOIN events e ON e.id = v.event_id
      WHERE e.user_id = (select auth.uid())
         OR e.team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()))
    )
  );

-- crm_sync_log
DROP POLICY IF EXISTS "Users see own sync logs" ON crm_sync_log;
CREATE POLICY "Users see own sync logs" ON crm_sync_log
  FOR SELECT USING (
    visitor_id IN (
      SELECT v.id FROM visitors v
      JOIN events e ON e.id = v.event_id
      WHERE e.user_id = (select auth.uid())
         OR e.team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()))
    )
  );

-- seller_reports
DROP POLICY IF EXISTS "Users see own reports" ON seller_reports;
CREATE POLICY "Users see own reports" ON seller_reports
  FOR SELECT USING (
    event_id IN (
      SELECT id FROM events WHERE user_id = (select auth.uid())
      UNION
      SELECT id FROM events WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users manage own reports" ON seller_reports;
CREATE POLICY "Users manage own reports" ON seller_reports
  FOR ALL USING (
    event_id IN (
      SELECT id FROM events WHERE user_id = (select auth.uid())
      UNION
      SELECT id FROM events WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()) AND role IN ('owner','admin'))
    )
  );

-- billing_links
DROP POLICY IF EXISTS "Users see own billing links" ON billing_links;
CREATE POLICY "Users see own billing links" ON billing_links
  FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users manage own billing links" ON billing_links;
CREATE POLICY "Users manage own billing links" ON billing_links
  FOR ALL USING (user_id = (select auth.uid()));

-- usage_log
DROP POLICY IF EXISTS "Users see own usage" ON usage_log;
CREATE POLICY "Users see own usage" ON usage_log
  FOR SELECT USING (user_id = (select auth.uid()));

-- integration_credentials
DROP POLICY IF EXISTS "Users see own credentials" ON integration_credentials;
CREATE POLICY "Users see own credentials" ON integration_credentials
  FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users manage own credentials" ON integration_credentials;
CREATE POLICY "Users manage own credentials" ON integration_credentials
  FOR ALL USING (user_id = (select auth.uid()));

-- Add missing FK indexes for join performance
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_property_media_property_id ON property_media(property_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_log_visitor_id ON follow_up_log(visitor_id);
CREATE INDEX IF NOT EXISTS idx_seller_reports_event_id ON seller_reports(event_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_log_visitor_id ON crm_sync_log(visitor_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_log_event_id ON crm_sync_log(event_id);
