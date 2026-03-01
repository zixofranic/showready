-- Add updated_at to crm_sync_log for retry backoff calculation
-- Backoff should be measured from last attempt, not initial creation
ALTER TABLE crm_sync_log ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
