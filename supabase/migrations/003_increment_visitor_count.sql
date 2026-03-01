CREATE OR REPLACE FUNCTION increment_visitor_count(event_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE events
  SET visitor_count = visitor_count + 1, updated_at = now()
  WHERE id = event_id;
$$;
