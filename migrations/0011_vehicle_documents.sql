-- Vehicle papers: insurance, PUC (pollution certificate) and registration certificate (RC).
-- A document is one entry (type + optional valid-until date) with up to 5 files (photos or PDFs).
-- Renewing adds a NEW entry, so earlier papers stay as history. Files live in the private R2 bucket under
-- vehicle-docs/ and are never auto-expired.
CREATE TABLE vehicle_documents (
  id TEXT NOT NULL PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles (id),
  doc_type TEXT NOT NULL CHECK (doc_type IN ('insurance', 'puc', 'registration')),
  valid_until TEXT CHECK (valid_until IS NULL OR valid_until GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),   -- IST calendar date, inclusive
  created_by TEXT NOT NULL REFERENCES "user" (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX vehicle_documents_idx ON vehicle_documents (vehicle_id, doc_type, created_at DESC);

CREATE TABLE vehicle_document_files (
  id TEXT NOT NULL PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES vehicle_documents (id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'application/pdf')),
  size_bytes INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES "user" (id),
  created_at TEXT NOT NULL
);
CREATE INDEX vehicle_document_files_idx ON vehicle_document_files (document_id, created_at);
