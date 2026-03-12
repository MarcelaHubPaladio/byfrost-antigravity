-- Add columns to store pre-rendered HTML and CSS for static serving
ALTER TABLE portal_pages 
ADD COLUMN IF NOT EXISTS published_html TEXT,
ADD COLUMN IF NOT EXISTS published_css TEXT;

-- Create an index to speed up domain lookups for the static server
CREATE INDEX IF NOT EXISTS idx_portal_pages_custom_domain ON portal_pages ((page_settings->>'custom_domain')) WHERE page_settings->>'custom_domain' IS NOT NULL;
