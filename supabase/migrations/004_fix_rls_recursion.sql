-- Fix RLS infinite recursion between team_members <-> teams policies.
-- Use SECURITY DEFINER functions to break the cycle.
-- Also fixes increment_visitor_count missing search_path.

-- Helper: get team_ids for the current user (bypasses RLS)
CREATE OR REPLACE FUNCTION get_my_team_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT team_id FROM team_members WHERE user_id = auth.uid() $$;

-- Helper: get team_ids the current user owns (bypasses RLS)
CREATE OR REPLACE FUNCTION get_my_owned_team_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM teams WHERE owner_id = auth.uid() $$;

-- Fix increment_visitor_count search_path
CREATE OR REPLACE FUNCTION increment_visitor_count(event_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ UPDATE events SET visitor_count = visitor_count + 1, updated_at = now() WHERE id = event_id; $$;

-- ═══ team_members ═══
DROP POLICY IF EXISTS "team_members_select" ON team_members;
DROP POLICY IF EXISTS "team_members_insert" ON team_members;
DROP POLICY IF EXISTS "team_members_delete" ON team_members;
DROP POLICY IF EXISTS "Users see own memberships" ON team_members;
DROP POLICY IF EXISTS "Users manage own membership" ON team_members;

CREATE POLICY "team_members_select" ON team_members
  FOR SELECT USING (user_id = (select auth.uid()) OR team_id IN (select get_my_owned_team_ids()));
CREATE POLICY "team_members_insert" ON team_members
  FOR INSERT WITH CHECK (team_id IN (select get_my_owned_team_ids()));
CREATE POLICY "team_members_delete" ON team_members
  FOR DELETE USING (user_id = (select auth.uid()) OR team_id IN (select get_my_owned_team_ids()));

-- ═══ teams ═══
DROP POLICY IF EXISTS "teams_select" ON teams;
DROP POLICY IF EXISTS "teams_all" ON teams;
DROP POLICY IF EXISTS "teams_manage" ON teams;

CREATE POLICY "teams_select" ON teams
  FOR SELECT USING (owner_id = (select auth.uid()) OR id IN (select get_my_team_ids()));
CREATE POLICY "teams_manage" ON teams
  FOR ALL USING (owner_id = (select auth.uid()));

-- ═══ properties ═══
DROP POLICY IF EXISTS "properties_all" ON properties;
DROP POLICY IF EXISTS "properties_select" ON properties;
DROP POLICY IF EXISTS "properties_manage" ON properties;
DROP POLICY IF EXISTS "Users see own properties" ON properties;
DROP POLICY IF EXISTS "Users manage own properties" ON properties;

CREATE POLICY "properties_select" ON properties
  FOR SELECT USING (user_id = (select auth.uid()) OR team_id IN (select get_my_team_ids()));
CREATE POLICY "properties_manage" ON properties
  FOR ALL USING (user_id = (select auth.uid()) OR team_id IN (select get_my_team_ids()));

-- ═══ property_media ═══
DROP POLICY IF EXISTS "property_media_all" ON property_media;
DROP POLICY IF EXISTS "property_media_select" ON property_media;
DROP POLICY IF EXISTS "property_media_manage" ON property_media;
DROP POLICY IF EXISTS "Users see own property media" ON property_media;
DROP POLICY IF EXISTS "Users manage own property media" ON property_media;

CREATE POLICY "property_media_select" ON property_media
  FOR SELECT USING (property_id IN (
    SELECT id FROM properties WHERE user_id = (select auth.uid()) OR team_id IN (select get_my_team_ids())
  ));
CREATE POLICY "property_media_manage" ON property_media
  FOR ALL USING (property_id IN (
    SELECT id FROM properties WHERE user_id = (select auth.uid()) OR team_id IN (select get_my_team_ids())
  ));

-- ═══ events ═══
DROP POLICY IF EXISTS "events_all" ON events;
DROP POLICY IF EXISTS "events_select" ON events;
DROP POLICY IF EXISTS "events_manage" ON events;
DROP POLICY IF EXISTS "Users see own events" ON events;
DROP POLICY IF EXISTS "Users manage own events" ON events;

CREATE POLICY "events_select" ON events
  FOR SELECT USING (user_id = (select auth.uid()) OR team_id IN (select get_my_team_ids()));
CREATE POLICY "events_manage" ON events
  FOR ALL USING (user_id = (select auth.uid()) OR team_id IN (select get_my_team_ids()));

-- ═══ visitors ═══
DROP POLICY IF EXISTS "visitors_all" ON visitors;
DROP POLICY IF EXISTS "visitors_select" ON visitors;
DROP POLICY IF EXISTS "visitors_manage" ON visitors;
DROP POLICY IF EXISTS "Users see own visitors" ON visitors;
DROP POLICY IF EXISTS "Users manage own visitors" ON visitors;

CREATE POLICY "visitors_select" ON visitors
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR event_id IN (SELECT id FROM events WHERE user_id = (select auth.uid()) OR team_id IN (select get_my_team_ids()))
  );
CREATE POLICY "visitors_manage" ON visitors
  FOR ALL USING (
    user_id = (select auth.uid())
    OR event_id IN (SELECT id FROM events WHERE user_id = (select auth.uid()) OR team_id IN (select get_my_team_ids()))
  );

-- ═══ email_templates (user_id only, no team_id column) ═══
DROP POLICY IF EXISTS "email_templates_select" ON email_templates;
DROP POLICY IF EXISTS "email_templates_all" ON email_templates;
DROP POLICY IF EXISTS "email_templates_manage" ON email_templates;
DROP POLICY IF EXISTS "Users see own templates" ON email_templates;
DROP POLICY IF EXISTS "Users manage own templates" ON email_templates;

CREATE POLICY "email_templates_select" ON email_templates
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "email_templates_manage" ON email_templates
  FOR ALL USING (user_id = (select auth.uid()));

-- ═══ follow_up_log ═══
DROP POLICY IF EXISTS "follow_up_log_select" ON follow_up_log;
DROP POLICY IF EXISTS "Users see own follow-ups" ON follow_up_log;

CREATE POLICY "follow_up_log_select" ON follow_up_log
  FOR SELECT USING (visitor_id IN (
    SELECT v.id FROM visitors v JOIN events e ON e.id = v.event_id
    WHERE e.user_id = (select auth.uid()) OR e.team_id IN (select get_my_team_ids())
  ));

-- ═══ crm_sync_log ═══
DROP POLICY IF EXISTS "crm_sync_log_select" ON crm_sync_log;
DROP POLICY IF EXISTS "Users see own sync logs" ON crm_sync_log;

CREATE POLICY "crm_sync_log_select" ON crm_sync_log
  FOR SELECT USING (event_id IN (
    SELECT id FROM events WHERE user_id = (select auth.uid()) OR team_id IN (select get_my_team_ids())
  ));

-- ═══ seller_reports ═══
DROP POLICY IF EXISTS "seller_reports_select" ON seller_reports;
DROP POLICY IF EXISTS "seller_reports_all" ON seller_reports;
DROP POLICY IF EXISTS "seller_reports_manage" ON seller_reports;
DROP POLICY IF EXISTS "Users see own reports" ON seller_reports;
DROP POLICY IF EXISTS "Users manage own reports" ON seller_reports;

CREATE POLICY "seller_reports_select" ON seller_reports
  FOR SELECT USING (event_id IN (
    SELECT id FROM events WHERE user_id = (select auth.uid()) OR team_id IN (select get_my_team_ids())
  ));
CREATE POLICY "seller_reports_manage" ON seller_reports
  FOR ALL USING (event_id IN (
    SELECT id FROM events WHERE user_id = (select auth.uid()) OR team_id IN (select get_my_team_ids())
  ));
