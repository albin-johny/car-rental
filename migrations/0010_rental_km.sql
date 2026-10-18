-- Odometer readings on the rental itself: start (pickup) and end (return).
-- Set when a pickup / return inspection is completed, or entered on the booking form for rentals
-- recorded as already out / completed. NULL means "not recorded" (e.g. an upcoming booking).
ALTER TABLE rentals ADD COLUMN start_km INTEGER CHECK (start_km IS NULL OR start_km >= 0);
ALTER TABLE rentals ADD COLUMN end_km INTEGER CHECK (end_km IS NULL OR end_km >= 0);

-- Existing rentals: take the readings from their completed inspections.
UPDATE rentals SET start_km = (SELECT odometer_km FROM inspections i WHERE i.rental_id = rentals.id AND i.type = 'pickup' AND i.completed_at IS NOT NULL);
UPDATE rentals SET end_km   = (SELECT odometer_km FROM inspections i WHERE i.rental_id = rentals.id AND i.type = 'return' AND i.completed_at IS NOT NULL);
