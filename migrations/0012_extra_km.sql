-- Daily km allowance and the rate charged per km beyond it. Money is integer paise.
-- daily_km_limit = 0 means no allowance is set (nothing is ever charged as extra km).
ALTER TABLE vehicles ADD COLUMN daily_km_limit INTEGER NOT NULL DEFAULT 0 CHECK (daily_km_limit >= 0);
ALTER TABLE vehicles ADD COLUMN extra_km_rate_paise INTEGER NOT NULL DEFAULT 0 CHECK (extra_km_rate_paise >= 0);

-- A rental keeps its own copy, set when booked (the vehicle's values, which staff can lower for a discount),
-- so later changes to the vehicle never alter an existing rental. extra_km / extra_km_charge_paise record
-- what was charged when the return inspection was completed (NULL until then).
ALTER TABLE rentals ADD COLUMN daily_km_limit INTEGER NOT NULL DEFAULT 0 CHECK (daily_km_limit >= 0);
ALTER TABLE rentals ADD COLUMN extra_km_rate_paise INTEGER NOT NULL DEFAULT 0 CHECK (extra_km_rate_paise >= 0);
ALTER TABLE rentals ADD COLUMN extra_km INTEGER CHECK (extra_km IS NULL OR extra_km >= 0);
ALTER TABLE rentals ADD COLUMN extra_km_charge_paise INTEGER CHECK (extra_km_charge_paise IS NULL OR extra_km_charge_paise >= 0);
