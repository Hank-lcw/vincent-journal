-- Expand article categories without losing editorial revisions or issue placements.
PRAGMA defer_foreign_keys = ON;
CREATE TEMP TABLE _vj_revisions AS SELECT * FROM article_revisions;
CREATE TEMP TABLE _vj_issue_articles AS SELECT * FROM issue_articles;
CREATE TABLE articles_new (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('aesthetics','healthy-aging','longevity','perspectives')),
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
  author_name TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (created_by) REFERENCES staff_users(id),
  FOREIGN KEY (updated_by) REFERENCES staff_users(id)
);
INSERT INTO articles_new (id,slug,title,subtitle,excerpt,body,category,status,cover_media_id,read_time_minutes,featured,seo_title,seo_description,published_at,created_by,updated_by,created_at,updated_at,author_name)
SELECT id,slug,title,subtitle,excerpt,body,category,status,cover_media_id,read_time_minutes,featured,seo_title,seo_description,published_at,created_by,updated_by,created_at,updated_at,COALESCE(author_name,'') FROM articles;
DROP TABLE articles;
ALTER TABLE articles_new RENAME TO articles;
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
INSERT INTO article_revisions SELECT * FROM _vj_revisions;
INSERT INTO issue_articles SELECT * FROM _vj_issue_articles;
DROP TABLE _vj_revisions;
DROP TABLE _vj_issue_articles;
PRAGMA defer_foreign_keys = OFF;
