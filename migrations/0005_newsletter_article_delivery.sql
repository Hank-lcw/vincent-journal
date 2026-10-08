-- Newsletter article-delivery workflow.
ALTER TABLE articles ADD COLUMN first_published_at TEXT;
UPDATE articles SET first_published_at=published_at WHERE first_published_at IS NULL AND published_at IS NOT NULL;

ALTER TABLE newsletter_campaigns ADD COLUMN article_id TEXT;
ALTER TABLE newsletter_campaigns ADD COLUMN auto_send INTEGER NOT NULL DEFAULT 0 CHECK (auto_send IN (0,1));
ALTER TABLE newsletter_campaigns ADD COLUMN auto_event_key TEXT;

CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_article ON newsletter_campaigns(article_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_campaigns_auto_event ON newsletter_campaigns(auto_event_key) WHERE auto_event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_auto_pending ON newsletter_campaigns(auto_send,status,created_at);
