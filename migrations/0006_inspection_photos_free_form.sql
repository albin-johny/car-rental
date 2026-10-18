-- Inspection photos become one free-form, ordered list (no front/rear/... categories).
-- Existing photos keep their upload order as their position.
CREATE TABLE inspection_photos_new (
  id TEXT NOT NULL PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections (id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL,                -- 1-based display order chosen by staff
  size_bytes INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES "user" (id),
  created_at TEXT NOT NULL
);

INSERT INTO inspection_photos_new (id, inspection_id, r2_key, position, size_bytes, created_by, created_at)
SELECT id, inspection_id, r2_key,
       ROW_NUMBER() OVER (PARTITION BY inspection_id ORDER BY created_at, id),
       size_bytes, created_by, created_at
FROM inspection_photos;

DROP TABLE inspection_photos;
ALTER TABLE inspection_photos_new RENAME TO inspection_photos;
CREATE INDEX inspection_photos_idx ON inspection_photos (inspection_id, position);
