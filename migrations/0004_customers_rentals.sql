-- Customers are created as a side effect of booking (name + phone always entered).
-- Unique on (phone, lower-cased name) so two people sharing a phone stay separate.
CREATE TABLE customers (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  phone TEXT NOT NULL,                -- digits only
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (phone, name_key)
);
CREATE INDEX customers_name_idx ON customers (name_key);

-- Rentals. Times are UTC ISO text (canonical toISOString form, so text order = time order).
-- Money is integer paise. total_paise is the agreed rent entered by staff;
-- rate_snapshot_paise is the vehicle's daily rate when booked (for reference only).
-- Status: booked -> active (picked up) -> returned; booked -> cancelled.
CREATE TABLE rentals (
  id TEXT NOT NULL PRIMARY KEY,
  rental_number TEXT NOT NULL UNIQUE,   -- R-2026-0001
  seq_year INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  vehicle_id TEXT NOT NULL REFERENCES vehicles (id),
  customer_id TEXT NOT NULL REFERENCES customers (id),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,                 -- expected return
  actual_pickup_at TEXT,
  actual_return_at TEXT,
  rate_snapshot_paise INTEGER NOT NULL CHECK (rate_snapshot_paise >= 0),
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  status TEXT NOT NULL CHECK (status IN ('booked','active','returned','cancelled')),
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES "user" (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (end_at > start_at),
  UNIQUE (seq_year, seq)
);
CREATE INDEX rentals_vehicle_idx ON rentals (vehicle_id, start_at);
CREATE INDEX rentals_status_idx ON rentals (status, start_at);
CREATE INDEX rentals_customer_idx ON rentals (customer_id);
