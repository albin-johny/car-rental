-- Whose car it is: the business's own fleet, or a car from the network (a friend or relative who lets us rent it out).
-- owner_name says whose, for network cars (NULL for own cars).
ALTER TABLE vehicles ADD COLUMN ownership TEXT NOT NULL DEFAULT 'own' CHECK (ownership IN ('own', 'network'));
ALTER TABLE vehicles ADD COLUMN owner_name TEXT;
