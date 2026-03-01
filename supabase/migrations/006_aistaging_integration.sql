-- ============================================
-- 006: AiStaging Cross-App Integration
-- Adds columns needed for ShowReady ↔ AiStaging integration
-- ============================================

-- Link properties to their AiStaging project
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS aistaging_project_id UUID;

-- Extend property_media for AI processing tracking
ALTER TABLE property_media
ADD COLUMN IF NOT EXISTS style TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed'
  CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS source_image_id UUID REFERENCES property_media(id),
ADD COLUMN IF NOT EXISTS aistaging_asset_id UUID,
ADD COLUMN IF NOT EXISTS aistaging_job_id UUID,
ADD COLUMN IF NOT EXISTS billing_ref TEXT;

-- Index for finding processing jobs by status
CREATE INDEX IF NOT EXISTS idx_property_media_status
  ON property_media(property_id, status) WHERE status IN ('pending', 'processing');

-- Index for finding media by source image (for before/after pairing)
CREATE INDEX IF NOT EXISTS idx_property_media_source
  ON property_media(source_image_id) WHERE source_image_id IS NOT NULL;
