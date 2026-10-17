// Test harness: a throwaway local D1 + R2 (real SQLite via wrangler's local runtime), migrated with the
// project's own migrations, and wired up the way the app reads its bindings (getCloudflareContext).
// Each test file runs in its own process and gets its own empty database.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "car-rental-test-"));

execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "car-rental", "--local", "--persist-to", dir], { cwd: root, stdio: "ignore" });
const proxy = await getPlatformProxy<CloudflareEnv>({ configPath: join(root, "wrangler.jsonc"), persist: { path: join(dir, "v3") } });
(globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")] = {
  env: proxy.env,
  ctx: { waitUntil() {}, passThroughOnException() {} },
  cf: {},
};

export const DB = proxy.env.DB;
export const PHOTOS = proxy.env.PHOTOS;

export async function teardown() {
  await proxy.dispose();
  rmSync(dir, { recursive: true, force: true });
}

const NOW = new Date().toISOString();
export const admin = { id: "admin1", name: "Asha Admin", email: "asha@test", role: "admin" as const };
export const staff = { id: "staff1", name: "Sam Staff", email: "sam@test", role: "staff" as const };

export async function seedBasics() {
  await DB.prepare(`INSERT INTO "user"(id,name,email,role,createdAt,updatedAt) VALUES (?1,?2,?3,'admin',?4,?4),(?5,?6,?7,'staff',?4,?4)`)
    .bind(admin.id, admin.name, admin.email, NOW, staff.id, staff.name, staff.email)
    .run();
  for (const id of ["v1", "v2", "v3"]) {
    await DB.prepare(
      `INSERT INTO vehicles(id,registration_number,make,model,year,fuel_type,transmission,seats,odometer_km,daily_rate_paise,deposit_paise,is_active,created_at,updated_at)
       VALUES (?1,?1,'Maruti','Swift',2022,'petrol','manual',5,10000,250000,0,?2,?3,?3)`,
    ).bind(id, id === "v3" ? 0 : 1, NOW).run();
  }
}

/** A valid rental form value; override any field. Dates are IST wall-clock (as typed in the form). */
export async function rentalInput(o: Record<string, string> = {}) {
  const { rentalSchema } = await import("../src/lib/rentals.ts");
  return rentalSchema.parse({
    customer_name: "Ravi Kumar", customer_phone: "9876543210", vehicle_id: "v1",
    start_at: "2030-01-10T10:00", end_at: "2030-01-12T10:00", total: "5000", notes: "", ...o,
  });
}

export function jpeg(n = 0): ArrayBuffer {
  const b = new Uint8Array(2000 + n);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b.buffer;
}
export const readings = async (o: Record<string, string> = {}) => {
  const { readingsSchema } = await import("../src/lib/inspections.ts");
  return readingsSchema.parse({ odometer_km: "10050", fuel_eighths: "6", notes: "", ...o });
};
