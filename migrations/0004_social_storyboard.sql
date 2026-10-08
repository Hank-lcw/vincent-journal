-- Persist AI-assisted social carousel storyboard planning.
ALTER TABLE social_drafts ADD COLUMN storyboard_json TEXT NOT NULL DEFAULT '[]';
