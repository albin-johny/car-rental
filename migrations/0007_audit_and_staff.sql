-- Audit log (rentals and inspections) and staff accounts that can be disabled.

-- A disabled user cannot sign in; users are never deleted (rentals and inspections reference them).
ALTER TABLE "user" ADD COLUMN "disabled" INTEGER NOT NULL DEFAULT 0 CHECK ("disabled" IN (0, 1));

-- Append-only: who changed what, and when. user_name is a snapshot so entries stay readable if a
-- user is renamed. rental_id links both rental and inspection entries to their rental.
CREATE TABLE audit_logs (
  id TEXT NOT NULL PRIMARY KEY,
  at TEXT NOT NULL,                       -- UTC ISO (toISOString form)
  user_id TEXT NOT NULL REFERENCES "user" ("id"),
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,                   -- e.g. rental.created, inspection.completed
  entity_type TEXT NOT NULL CHECK (entity_type IN ('rental', 'inspection')),
  entity_id TEXT NOT NULL,
  rental_id TEXT,
  summary TEXT NOT NULL,                  -- one readable sentence
  changes TEXT                            -- JSON: [{"field": "...", "from": "...", "to": "..."}]
);
CREATE INDEX audit_logs_at_idx ON audit_logs (at DESC, id DESC);
CREATE INDEX audit_logs_rental_idx ON audit_logs (rental_id, at DESC);
CREATE INDEX audit_logs_user_idx ON audit_logs (user_id, at DESC);

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
