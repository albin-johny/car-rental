-- Pickup / return inspections. One of each type per rental.
-- completed_at IS NULL means draft (editable, photos can be added/removed).
-- A completed inspection is read-only; corrections are rows in inspection_addenda.
CREATE TABLE inspections (
  id TEXT NOT NULL PRIMARY KEY,
  rental_id TEXT NOT NULL REFERENCES rentals (id),
  vehicle_id TEXT NOT NULL REFERENCES vehicles (id),
  type TEXT NOT NULL CHECK (type IN ('pickup','return')),
  inspected_at TEXT NOT NULL,
  odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0),
  fuel_eighths INTEGER NOT NULL CHECK (fuel_eighths BETWEEN 0 AND 8),
  notes TEXT,                                   -- damage / condition notes
  inspected_by TEXT NOT NULL REFERENCES "user" (id),
  override_reason TEXT,                         -- set when an admin waived the minimum photo set
  override_by TEXT REFERENCES "user" (id),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (rental_id, type)
);
CREATE INDEX inspections_vehicle_idx ON inspections (vehicle_id);

-- R2 keys live under inspections/ so a prefix-scoped 365-day lifecycle rule can expire them
-- without touching vehicle photos. The row stays after the image expires.
CREATE TABLE inspection_photos (
  id TEXT NOT NULL PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections (id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('front','rear','left','right','interior','odometer','damage')),
  caption TEXT,
  size_bytes INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES "user" (id),
  created_at TEXT NOT NULL
);
CREATE INDEX inspection_photos_idx ON inspection_photos (inspection_id, category, created_at);

CREATE TABLE inspection_addenda (
  id TEXT NOT NULL PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections (id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES "user" (id),
  created_at TEXT NOT NULL
);
CREATE INDEX inspection_addenda_idx ON inspection_addenda (inspection_id, created_at);
