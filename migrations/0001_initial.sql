PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS staff_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','reviewer','editor')) DEFAULT 'editor',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('aesthetics','healthy-aging','longevity')),
  status TEXT NOT NULL CHECK (status IN ('draft','in_review','approved','published','archived')) DEFAULT 'draft',
  cover_media_id TEXT,
  read_time_minutes INTEGER NOT NULL DEFAULT 6,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  seo_title TEXT,
  seo_description TEXT,
  published_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES staff_users(id),
  FOREIGN KEY (updated_by) REFERENCES staff_users(id)
);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);

CREATE TABLE IF NOT EXISTS article_revisions (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  change_note TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(article_id, revision_no),
  FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES staff_users(id)
);
CREATE INDEX IF NOT EXISTS idx_article_revisions_article ON article_revisions(article_id, revision_no DESC);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  public_url TEXT,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  source TEXT NOT NULL CHECK (source IN ('upload','ai_generate','ai_edit','canva','import')),
  parent_media_id TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('private','public')) DEFAULT 'private',
  alt_text TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  ai_prompt TEXT,
  ai_model TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(parent_media_id) REFERENCES media_assets(id),
  FOREIGN KEY(created_by) REFERENCES staff_users(id)
);
CREATE INDEX IF NOT EXISTS idx_media_created ON media_assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_visibility ON media_assets(visibility);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  volume INTEGER NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  editor_note TEXT NOT NULL DEFAULT '',
  cover_media_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft','in_review','approved','published','archived')) DEFAULT 'draft',
  published_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(cover_media_id) REFERENCES media_assets(id),
  FOREIGN KEY(created_by) REFERENCES staff_users(id),
  FOREIGN KEY(updated_by) REFERENCES staff_users(id)
);

CREATE TABLE IF NOT EXISTS issue_articles (
  issue_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_cover_story INTEGER NOT NULL DEFAULT 0 CHECK (is_cover_story IN (0,1)),
  PRIMARY KEY(issue_id, article_id),
  FOREIGN KEY(issue_id) REFERENCES issues(id) ON DELETE CASCADE,
  FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL CHECK (status IN ('pending','active','unsubscribed','suppressed')) DEFAULT 'pending',
  verification_token_hash TEXT,
  verification_expires_at TEXT,
  unsubscribe_token_hash TEXT,
  verified_at TEXT,
  unsubscribed_at TEXT,
  source TEXT NOT NULL DEFAULT 'website',
  resend_contact_id TEXT,
  consent_ip_hash TEXT,
  consent_user_agent TEXT,
  consent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);

CREATE TABLE IF NOT EXISTS suppressions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  reason TEXT NOT NULL CHECK (reason IN ('bounce','complaint','manual','provider')),
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(email, reason, provider)
);

CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  id TEXT PRIMARY KEY,
  issue_id TEXT,
  subject TEXT NOT NULL,
  preview_text TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft','in_review','approved','scheduled','sending','sent','cancelled','failed')) DEFAULT 'draft',
  provider_broadcast_id TEXT,
  scheduled_at TEXT,
  sent_at TEXT,
  created_by TEXT NOT NULL,
  approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(issue_id) REFERENCES issues(id),
  FOREIGN KEY(created_by) REFERENCES staff_users(id),
  FOREIGN KEY(approved_by) REFERENCES staff_users(id)
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('canva','facebook','instagram','threads','xiaohongshu','resend')),
  account_label TEXT,
  external_account_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('disconnected','connected','expired','error','limited')) DEFAULT 'disconnected',
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  token_nonce TEXT,
  refresh_nonce TEXT,
  token_expires_at TEXT,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  connected_by TEXT,
  connected_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, external_account_id),
  FOREIGN KEY(connected_by) REFERENCES staff_users(id)
);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider, status);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  code_verifier TEXT,
  staff_user_id TEXT NOT NULL,
  redirect_after TEXT NOT NULL DEFAULT '/studio.html',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_drafts (
  id TEXT PRIMARY KEY,
  article_id TEXT,
  issue_id TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('instagram','facebook','threads','xiaohongshu')),
  format TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  copy TEXT NOT NULL DEFAULT '',
  media_ids_json TEXT NOT NULL DEFAULT '[]',
  canva_design_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft','in_review','approved','scheduled','published','failed','ready_to_publish')) DEFAULT 'draft',
  scheduled_at TEXT,
  published_at TEXT,
  external_post_id TEXT,
  created_by TEXT NOT NULL,
  approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(article_id) REFERENCES articles(id),
  FOREIGN KEY(issue_id) REFERENCES issues(id),
  FOREIGN KEY(created_by) REFERENCES staff_users(id),
  FOREIGN KEY(approved_by) REFERENCES staff_users(id)
);
CREATE INDEX IF NOT EXISTS idx_social_drafts_platform_status ON social_drafts(platform, status);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('article','issue','newsletter','social')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('submit','approve','reject','publish','unpublish')),
  note TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(actor_id) REFERENCES staff_users(id)
);
CREATE INDEX IF NOT EXISTS idx_approvals_entity ON approvals(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS publish_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN ('article_publish','newsletter_send','social_publish','backup')),
  entity_id TEXT,
  platform TEXT,
  run_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','cancelled')) DEFAULT 'pending',
  payload_json TEXT NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by) REFERENCES staff_users(id)
);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_due ON publish_jobs(status, run_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  request_id TEXT,
  ip_hash TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(actor_id) REFERENCES staff_users(id)
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  object_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('started','completed','failed')) DEFAULT 'started',
  row_counts_json TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
