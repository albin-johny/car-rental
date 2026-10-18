import { ViewTransition } from "react";

// A template (unlike a layout) is remounted on every navigation, so each new screen animates in:
// forward moves slide in from the right, the back arrow slides in from the left. Tab bar and side rail are not wrapped, so they stay put.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={{ "nav-back": "nav-back", default: "nav-forward" }} exit="none" default="none">
      {children}
    </ViewTransition>
  );
}
