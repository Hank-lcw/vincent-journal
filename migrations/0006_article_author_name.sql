-- Attribution is opt-in: old articles remain credited to the journal, not automatically to an individual.
ALTER TABLE articles ADD COLUMN author_name TEXT NOT NULL DEFAULT '';
