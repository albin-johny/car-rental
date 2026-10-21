-- One payment per rental. Existing and new rentals default to 'paid' (most customers pay at the return);
-- staff mark one 'pending' at the return inspection when the money is still to come, and 'paid' once it arrives.
-- paid_at is when it was marked paid (the return time when paid at the return).
ALTER TABLE rentals ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'pending'));
ALTER TABLE rentals ADD COLUMN paid_at TEXT;
