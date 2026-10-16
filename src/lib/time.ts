const fmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "medium",
  timeStyle: "short",
});
export function formatIST(iso: string): string {
  return fmt.format(new Date(iso));
}
