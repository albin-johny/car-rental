// Client-safe constants (no server imports).
export const FUEL_TYPES = ["petrol", "diesel", "cng", "electric", "hybrid"] as const;
export const TRANSMISSIONS = ["manual", "automatic"] as const;
export const MAX_PHOTOS = 8;
export const MAX_PHOTO_BYTES = 400 * 1024; // client targets ~300 KB; server allows headroom
