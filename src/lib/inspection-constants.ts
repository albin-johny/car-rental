// Client-safe (no server imports).
export const INSPECTION_TYPES = ["pickup", "return"] as const;
export type InspectionType = (typeof INSPECTION_TYPES)[number];

export const TYPE_LABEL: Record<InspectionType, string> = { pickup: "Pickup", return: "Return" };

/** At least this many photos are needed to complete an inspection (an admin can waive it). */
export const MIN_PHOTOS = 1;
export const MAX_INSPECTION_PHOTOS = 24;

export function fuelLabel(eighths: number): string {
  if (eighths <= 0) return "Empty";
  if (eighths >= 8) return "Full";
  return `${eighths}/8`;
}

/** True for a photo an admin added after the inspection was completed. */
export const isLatePhoto = (photoCreatedAt: string, completedAt: string | null) => !!completedAt && photoCreatedAt > completedAt;
