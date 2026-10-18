import { getCloudflareContext } from "@opennextjs/cloudflare";

export function env(): CloudflareEnv {
  return getCloudflareContext().env;
}
