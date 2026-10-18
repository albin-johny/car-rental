-- Money is integer paise (1 INR = 100 paise). Timestamps are UTC ISO-8601 text;
-- they are rendered in Asia/Kolkata at display time.
CREATE TABLE vehicles (
  id TEXT NOT NULL PRIMARY KEY,
  registration_number TEXT NOT NULL UNIQUE,      -- normalised: upper-case, no spaces
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year BETWEEN 1990 AND 2100),
  color TEXT,
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('petrol','diesel','cng','electric','hybrid')),
  transmission TEXT NOT NULL CHECK (transmission IN ('manual','automatic')),
  seats INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 60),
  odometer_km INTEGER NOT NULL DEFAULT 0 CHECK (odometer_km >= 0),
  daily_rate_paise INTEGER NOT NULL CHECK (daily_rate_paise >= 0),
  deposit_paise INTEGER NOT NULL DEFAULT 0 CHECK (deposit_paise >= 0),
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX vehicles_active_idx ON vehicles (is_active);

CREATE TABLE vehicle_photos (
  id TEXT NOT NULL PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX vehicle_photos_vehicle_idx ON vehicle_photos (vehicle_id, created_at);
