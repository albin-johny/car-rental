-- Service cost (optional, integer paise) and bills (photos or PDFs) attached to a service entry.
ALTER TABLE service_records ADD COLUMN cost_paise INTEGER CHECK (cost_paise IS NULL OR cost_paise >= 0);

-- Files live in the private R2 bucket under service/. Unlike inspection photos they are never expired:
-- a bill is a financial record.
CREATE TABLE service_bills (
  id TEXT NOT NULL PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES service_records (id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'application/pdf')),
  size_bytes INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES "user" (id),
  created_at TEXT NOT NULL
);
CREATE INDEX service_bills_record_idx ON service_bills (record_id, created_at);
