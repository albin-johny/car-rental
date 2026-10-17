-- Service history per vehicle. A service entry has a date, the odometer reading, a free-text
-- description, and any number of work items (repairs / replacements / tyre work).
-- Work items live in a shared catalogue so they can be suggested while typing, like customer names.

CREATE TABLE service_items (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,         -- lower-case, single-spaced: "tyre rotation"
  created_at TEXT NOT NULL
);

CREATE TABLE service_records (
  id TEXT NOT NULL PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles (id),
  serviced_on TEXT NOT NULL CHECK (serviced_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),  -- IST calendar date
  odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0),
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES "user" (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX service_records_vehicle_idx ON service_records (vehicle_id, serviced_on DESC, odometer_km DESC);

CREATE TABLE service_record_items (
  record_id TEXT NOT NULL REFERENCES service_records (id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES service_items (id),
  PRIMARY KEY (record_id, item_id)
);
CREATE INDEX service_record_items_item_idx ON service_record_items (item_id);

-- Starter catalogue so suggestions exist from day one. Anything typed later is added automatically.
INSERT INTO service_items (id, name, name_key, created_at) VALUES
  ('si-01', 'General service', 'general service', '2026-01-01T00:00:00.000Z'),
  ('si-02', 'Engine oil change', 'engine oil change', '2026-01-01T00:00:00.000Z'),
  ('si-03', 'Oil filter', 'oil filter', '2026-01-01T00:00:00.000Z'),
  ('si-04', 'Air filter', 'air filter', '2026-01-01T00:00:00.000Z'),
  ('si-05', 'Cabin (AC) filter', 'cabin (ac) filter', '2026-01-01T00:00:00.000Z'),
  ('si-06', 'Fuel filter', 'fuel filter', '2026-01-01T00:00:00.000Z'),
  ('si-07', 'Spark plugs', 'spark plugs', '2026-01-01T00:00:00.000Z'),
  ('si-08', 'Brake pads (front)', 'brake pads (front)', '2026-01-01T00:00:00.000Z'),
  ('si-09', 'Brake pads (rear)', 'brake pads (rear)', '2026-01-01T00:00:00.000Z'),
  ('si-10', 'Brake discs', 'brake discs', '2026-01-01T00:00:00.000Z'),
  ('si-11', 'Brake fluid', 'brake fluid', '2026-01-01T00:00:00.000Z'),
  ('si-12', 'Clutch plate', 'clutch plate', '2026-01-01T00:00:00.000Z'),
  ('si-13', 'Coolant top-up', 'coolant top-up', '2026-01-01T00:00:00.000Z'),
  ('si-14', 'Battery replacement', 'battery replacement', '2026-01-01T00:00:00.000Z'),
  ('si-15', 'Wiper blades', 'wiper blades', '2026-01-01T00:00:00.000Z'),
  ('si-16', 'Headlight bulb', 'headlight bulb', '2026-01-01T00:00:00.000Z'),
  ('si-17', 'AC service', 'ac service', '2026-01-01T00:00:00.000Z'),
  ('si-18', 'Suspension repair', 'suspension repair', '2026-01-01T00:00:00.000Z'),
  ('si-19', 'Timing belt', 'timing belt', '2026-01-01T00:00:00.000Z'),
  ('si-20', 'Tyre rotation', 'tyre rotation', '2026-01-01T00:00:00.000Z'),
  ('si-21', 'Wheel alignment', 'wheel alignment', '2026-01-01T00:00:00.000Z'),
  ('si-22', 'Wheel balancing', 'wheel balancing', '2026-01-01T00:00:00.000Z'),
  ('si-23', 'Tyre replacement', 'tyre replacement', '2026-01-01T00:00:00.000Z'),
  ('si-24', 'Tyre puncture repair', 'tyre puncture repair', '2026-01-01T00:00:00.000Z');
