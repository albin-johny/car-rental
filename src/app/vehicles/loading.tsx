import { ListSkeleton } from "@/components/skeletons";

// Shown the moment you open this screen, until its data arrives.
export default function Loading() {
  return <ListSkeleton />;
}
