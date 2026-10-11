CREATE TABLE IF NOT EXISTS editorial_people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  english_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  education TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  photo_media_id TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(photo_media_id) REFERENCES media_assets(id),
  FOREIGN KEY(created_by) REFERENCES staff_users(id),
  FOREIGN KEY(updated_by) REFERENCES staff_users(id)
);
CREATE INDEX IF NOT EXISTS idx_editorial_people_order ON editorial_people(visible,is_primary DESC,sort_order,created_at);

INSERT OR IGNORE INTO editorial_people
(id,name,english_name,title,education,experience,bio,is_primary,visible,sort_order,created_at,updated_at)
VALUES
('editorial-vincent',
 '林哲緯',
 'Vincent Lin',
 '主編 / Editor-in-Chief',
 '中國醫藥大學 醫學系',
 'VINCENT JOURNAL 主編',
 '我相信，美學不只是改變外貌的技術，也是一種理解比例、結構與個體差異的方式。VINCENT JOURNAL 記錄我對醫學、美學與健康老化的思考。',
 1,1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
