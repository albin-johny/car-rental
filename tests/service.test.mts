import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { DB, PHOTOS, admin, jpeg, seedBasics, staff, teardown } from "./helpers.mts";
import {
  addServiceBill, createServiceRecord, deleteServiceBill, deleteServiceRecord, serviceSpend, sniffBill, lastDoneForVehicle, lastServiceSummary, listServiceHistory, serviceSchema,
  suggestServiceItems, updateServiceRecord,
} from "../src/lib/service.ts";
import { canModifyService, cleanItemName, dedupeItems, formatServiceDate, itemKey } from "../src/lib/service-shared.ts";
import { istDateInput } from "../src/lib/periods.ts";

before(seedBasics);
after(teardown);

const today = istDateInput(Date.now());
const input = (o: Record<string, unknown> = {}) => serviceSchema.parse({ serviced_on: "2026-09-01", odometer_km: "42000", notes: "", items: ["Brake pads (front)"], ...o });
const add = async (vehicle: string, o: Record<string, unknown> = {}, who = staff) => ((await createServiceRecord(vehicle, input(o), who)) as { id: string }).id;
const catalogue = async () => (await DB.prepare("SELECT name FROM service_items ORDER BY name").all<{ name: string }>()).results.map((r) => r.name);

test("item names are cleaned and de-duplicated regardless of case and spacing", () => {
  assert.equal(cleanItemName("  brake   pad "), "Brake pad");
  assert.equal(itemKey("  TYRE   Rotation"), "tyre rotation");
  assert.deepEqual(dedupeItems(["tyre rotation", "Tyre  Rotation", "", "Wheel alignment", "  "]), ["Tyre rotation", "Wheel alignment"]);
});

test("the starter catalogue includes the tyre work", async () => {
  const names = await catalogue();
  for (const n of ["Tyre rotation", "Wheel alignment", "Wheel balancing", "Tyre replacement", "Brake pads (front)", "Engine oil change"]) assert.ok(names.includes(n), n);
});

test("an entry keeps its date, km, description, author and several items", async () => {
  const id = await add("v1", { serviced_on: "2026-09-10", odometer_km: "41,000".replace(",", ""), notes: "Pads were worn to the metal", items: ["Brake pads (front)", "Tyre rotation", "Wheel alignment"] });
  const [rec] = await listServiceHistory("v1");
  assert.equal(rec.id, id);
  assert.deepEqual([rec.serviced_on, rec.odometer_km, rec.notes, rec.created_by_name], ["2026-09-10", 41000, "Pads were worn to the metal", "Sam Staff"]);
  assert.deepEqual(rec.items, ["Brake pads (front)", "Tyre rotation", "Wheel alignment"]);
});

test("typed items are added to the catalogue once and then reused (any spelling)", async () => {
  const before = (await catalogue()).length;
  await add("v1", { serviced_on: "2026-09-11", items: ["headlight  cover", "Tyre ROTATION"] });
  await add("v2", { serviced_on: "2026-09-12", items: ["Headlight cover"] });
  const after = await catalogue();
  assert.equal(after.length, before + 1, "only 'Headlight cover' is new");
  assert.ok(after.includes("Headlight cover"));
  assert.equal(((await DB.prepare("SELECT COUNT(*) n FROM service_items WHERE name_key = 'headlight cover'").first()) as { n: number }).n, 1);
});

test("two people adding the same brand-new item at once create it once", async () => {
  await Promise.all([1, 2, 3, 4].map((i) => add("v2", { serviced_on: `2026-08-0${i}`, items: ["Rear wiper motor"] })));
  assert.equal(((await DB.prepare("SELECT COUNT(*) n FROM service_items WHERE name_key = 'rear wiper motor'").first()) as { n: number }).n, 1);
  const recs = (await listServiceHistory("v2")).filter((r) => r.items.includes("Rear wiper motor"));
  assert.equal(recs.length, 4, "all four entries are linked to it");
});

test("validation: km, date, items or description", () => {
  const bad = (o: Record<string, unknown>) => !serviceSchema.safeParse({ serviced_on: "2026-09-01", odometer_km: "100", notes: "", items: ["Oil filter"], ...o }).success;
  assert.ok(bad({ odometer_km: "-1" }));
  assert.ok(bad({ odometer_km: "12.5" }));
  assert.ok(bad({ odometer_km: "abc" }));
  assert.ok(bad({ odometer_km: "9999999" }));
  assert.ok(bad({ serviced_on: "" }));
  assert.ok(bad({ serviced_on: "2026-02-31" }), "impossible date");
  assert.ok(bad({ serviced_on: "2999-01-01" }), "future date");
  assert.ok(bad({ items: [], notes: "" }), "nothing to record");
  assert.ok(bad({ items: ["x"] }), "item too short");
  assert.ok(bad({ items: Array.from({ length: 21 }, (_, i) => `Item number ${i}`) }), "too many items");
  assert.ok(bad({ notes: "x".repeat(1001) }));
  assert.ok(!bad({ items: [], notes: "Only a description" }), "a description alone is fine");
  assert.ok(!bad({ serviced_on: today }), "today is fine");
  assert.ok(!bad({ odometer_km: "0" }));
});

test("history is newest first by date, then km", async () => {
  const id1 = await add("v3", { serviced_on: "2026-01-10", odometer_km: "30000" });
  const id2 = await add("v3", { serviced_on: "2026-05-10", odometer_km: "39000" });
  const id3 = await add("v3", { serviced_on: "2026-05-10", odometer_km: "39500" });
  assert.deepEqual((await listServiceHistory("v3")).map((r) => r.id), [id3, id2, id1]);
  assert.deepEqual(await lastServiceSummary("v3"), { serviced_on: "2026-05-10", odometer_km: 39500 });
  assert.equal(await lastServiceSummary("nope"), null);
});

test("'last done' gives, per item, the latest date and km", async () => {
  await add("v1", { serviced_on: "2026-03-01", odometer_km: "35000", items: ["Tyre rotation", "Wheel alignment"] });
  await add("v1", { serviced_on: "2026-07-01", odometer_km: "40000", items: ["Tyre rotation"] });
  const last = Object.fromEntries((await lastDoneForVehicle("v1")).map((x) => [x.name, x]));
  assert.deepEqual([last["Tyre rotation"].serviced_on, last["Tyre rotation"].odometer_km], ["2026-09-11", 42000], "the most recent rotation, with its km");
  assert.equal(last["Wheel alignment"].serviced_on, "2026-09-10", "the later alignment wins over March");
});

test("suggestions: prefix matches first, then most used; empty text gives the most used", async () => {
  const s = (await suggestServiceItems("tyre")).map((x) => x.name);
  assert.ok(s.length >= 3 && s.every((n) => n.toLowerCase().includes("tyre")), "tyre rotation, replacement and puncture repair");
  assert.equal(s[0], "Tyre rotation", "most used tyre item first");
  const mid = (await suggestServiceItems("rotation")).map((x) => x.name);
  assert.ok(mid.includes("Tyre rotation"), "matches in the middle of a name too");
  const top = await suggestServiceItems("");
  const maxUses = ((await DB.prepare("SELECT MAX(c) m FROM (SELECT COUNT(*) c FROM service_record_items GROUP BY item_id)").first()) as { m: number }).m;
  assert.equal(top[0].uses, maxUses, "the most-used item overall comes first");
  assert.ok(top[0].uses >= top[top.length - 1].uses, "sorted by use");
  assert.deepEqual(await suggestServiceItems("zzzzzz"), []);
  assert.deepEqual(await suggestServiceItems("100%"), [], "wildcards are matched literally");
});

test("who can change an entry: admin always; the author for 24 hours; nobody else", async () => {
  const id = await add("v2", { serviced_on: "2026-06-01", items: ["Oil filter"] }, staff);
  const rec = (await DB.prepare("SELECT * FROM service_records WHERE id = ?").bind(id).first()) as { created_by: string; created_at: string };
  const now = Date.parse(rec.created_at);
  assert.ok(canModifyService(rec, admin, now + 99 * 86400_000));
  assert.ok(canModifyService(rec, staff, now + 3600_000));
  assert.ok(!canModifyService(rec, staff, now + 25 * 3600_000), "staff window closed");
  assert.ok(!canModifyService(rec, { id: "other", role: "staff" }, now + 1000), "someone else's entry");
  // end to end
  const other = { id: "staff2", name: "Other", role: "staff" as const };
  assert.match(String(((await updateServiceRecord(id, input({ items: ["Oil filter"] }), other)) as { error: string }).error), /Only an admin/);
  assert.match(String(((await deleteServiceRecord(id, other)) as { error: string }).error), /Only an admin/);
  await DB.prepare("UPDATE service_records SET created_at = ? WHERE id = ?").bind(new Date(Date.now() - 30 * 3600_000).toISOString(), id).run();
  assert.ok("error" in (await updateServiceRecord(id, input({ items: ["Oil filter"] }), staff)), "author, but after 24h");
  assert.ok("ok" in (await updateServiceRecord(id, input({ items: ["Oil filter"] }), admin)), "admin can");
});

test("editing replaces the items and fields; the catalogue keeps the old items", async () => {
  const id = await add("v2", { serviced_on: "2026-04-01", odometer_km: "20000", items: ["Spark plugs", "Air filter"] });
  assert.ok("ok" in (await updateServiceRecord(id, input({ serviced_on: "2026-04-02", odometer_km: "20500", notes: "corrected", items: ["Air filter", "Coolant top-up"] }), staff)));
  const rec = (await listServiceHistory("v2")).find((r) => r.id === id)!;
  assert.deepEqual([rec.serviced_on, rec.odometer_km, rec.notes, rec.items], ["2026-04-02", 20500, "corrected", ["Air filter", "Coolant top-up"]]);
  assert.ok((await catalogue()).includes("Spark plugs"), "removed items stay available as suggestions");
});

test("deleting removes the entry and its links, but not the catalogue", async () => {
  const id = await add("v2", { serviced_on: "2026-02-01", items: ["Brake fluid"] });
  assert.ok("ok" in (await deleteServiceRecord(id, staff)));
  assert.equal(((await DB.prepare("SELECT COUNT(*) n FROM service_record_items WHERE record_id = ?").bind(id).first()) as { n: number }).n, 0);
  assert.equal((await listServiceHistory("v2")).some((r) => r.id === id), false);
  assert.ok((await catalogue()).includes("Brake fluid"));
  assert.ok("error" in (await deleteServiceRecord(id, admin)), "already gone");
});

test("an unknown vehicle is refused and leaves nothing behind", async () => {
  const before = ((await DB.prepare("SELECT COUNT(*) n FROM service_items").first()) as { n: number }).n;
  assert.deepEqual(await createServiceRecord("nope", input({ items: ["Brand new thing"] }), staff), { error: "Vehicle not found" });
  assert.equal(((await DB.prepare("SELECT COUNT(*) n FROM service_items").first()) as { n: number }).n, before, "no catalogue pollution");
});

test("service history survives a vehicle being deactivated, and is listed per car", async () => {
  await add("v3", { serviced_on: "2026-06-06", items: ["AC service"] });
  assert.ok((await listServiceHistory("v3")).length >= 4);
  assert.equal((await listServiceHistory("v1")).every((r) => r.vehicle_id === "v1"), true);
});

test("dates are shown as plain calendar dates", () => {
  assert.equal(formatServiceDate("2026-10-12"), "12 Oct 2026");
  assert.equal(formatServiceDate("2026-01-01"), "1 Jan 2026");
});

// ---------------------------------------------------------------------------------------------------------
// cost and bills

const pdf = (extra = 0) => { const b = new Uint8Array(1500 + extra); b.set(new TextEncoder().encode("%PDF-1.4\n%bill")); return b.buffer; };
const billCount = async (rec: string) => ((await DB.prepare("SELECT COUNT(*) n FROM service_bills WHERE record_id = ?").bind(rec).first()) as { n: number }).n;
const stored = async (prefix: string) => (await PHOTOS.list({ prefix })).objects.length;

test("cost is optional, parsed to integer paise, and validated", async () => {
  assert.equal(input({ cost: "" }).cost, null);
  assert.equal(input({}).cost, null, "not given");
  assert.equal(input({ cost: "4500" }).cost, 450000);
  assert.equal(input({ cost: "4,500.50" }).cost, 450050);
  assert.equal(input({ cost: "0" }).cost, 0);
  for (const bad of ["-1", "abc", "12.345", "₹500"]) assert.ok(!serviceSchema.safeParse({ serviced_on: "2026-09-01", odometer_km: "100", items: ["Oil filter"], cost: bad }).success, bad);
  const id = await add("v1", { serviced_on: "2026-02-01", cost: "1234.50" });
  assert.equal((await listServiceHistory("v1")).find((r) => r.id === id)!.cost_paise, 123450);
  assert.ok("ok" in (await updateServiceRecord(id, input({ serviced_on: "2026-02-01", cost: "" }), admin)));
  assert.equal((await listServiceHistory("v1")).find((r) => r.id === id)!.cost_paise, null, "cost can be cleared");
});

test("total service spend per car sums the costs (entries without a cost count as zero)", async () => {
  await add("v3", { serviced_on: "2026-03-01", cost: "1000" });
  await add("v3", { serviced_on: "2026-03-02", cost: "250.75" });
  await add("v3", { serviced_on: "2026-03-03", cost: "" });
  const sp = await serviceSpend("v3");
  const rows = (await DB.prepare("SELECT cost_paise c FROM service_records WHERE vehicle_id = 'v3'").all<{ c: number | null }>()).results;
  assert.equal(sp.total, rows.reduce((a, r) => a + (r.c ?? 0), 0));
  assert.equal(sp.entries, rows.length);
  assert.equal(sp.priced, rows.filter((r) => r.c !== null).length);
  assert.ok(sp.total >= 125075);
});

test("file types are detected from the real bytes, not from a label", () => {
  assert.equal(sniffBill(jpeg()), "image/jpeg");
  assert.equal(sniffBill(pdf()), "application/pdf");
  assert.equal(sniffBill(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), null, "PNG is not accepted");
  assert.equal(sniffBill(new TextEncoder().encode("<script>alert(1)</script>").buffer as ArrayBuffer), null);
  assert.equal(sniffBill(new ArrayBuffer(0)), null);
});

test("a bill can be a photo or a PDF; they are listed with the entry and stored privately", async () => {
  const id = await add("v2", { serviced_on: "2026-01-05", cost: "5000" });
  const a = (await addServiceBill(id, jpeg(), staff)) as { id: string };
  const b = (await addServiceBill(id, pdf(), staff)) as { id: string };
  assert.ok(a.id && b.id);
  const rec = (await listServiceHistory("v2")).find((r) => r.id === id)!;
  assert.deepEqual(rec.bills.map((x) => x.content_type), ["image/jpeg", "application/pdf"]);
  assert.equal(await stored(`service/v2/${id}/`), 2);
  const keys = (await PHOTOS.list({ prefix: `service/v2/${id}/` })).objects.map((o) => o.key);
  assert.ok(keys.every((k) => k.startsWith("service/")), "under the service/ prefix, outside the 365-day inspections rule");
  assert.ok(keys.some((k) => k.endsWith(".pdf")) && keys.some((k) => k.endsWith(".jpg")));
});

test("bill rules: real type, size limits, at most 5, and nothing is stored when refused", async () => {
  const id = await add("v2", { serviced_on: "2026-01-06" });
  assert.equal(((await addServiceBill(id, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]).buffer, staff)) as { status: number }).status, 415);
  assert.equal(((await addServiceBill(id, new Uint8Array(700_000).fill(1).buffer.slice(0) as ArrayBuffer, staff)) as { status: number }).status, 415, "random bytes are not a JPEG");
  const bigJpeg = new Uint8Array(700 * 1024); bigJpeg.set([0xff, 0xd8, 0xff]);
  assert.equal(((await addServiceBill(id, bigJpeg.buffer, staff)) as { status: number }).status, 413, "photo over 600 KB");
  const bigPdf = new Uint8Array(3 * 1024 * 1024 + 10); bigPdf.set(new TextEncoder().encode("%PDF-1.4"));
  assert.equal(((await addServiceBill(id, bigPdf.buffer, staff)) as { status: number }).status, 413, "PDF over 3 MB");
  assert.equal(await stored(`service/v2/${id}/`), 0, "refused files leave nothing in storage");
  for (let n = 0; n < 5; n++) assert.ok("ok" in (await addServiceBill(id, jpeg(n), staff)));
  assert.equal(((await addServiceBill(id, jpeg(9), staff)) as { status: number }).status, 409, "sixth bill");
  assert.equal(await billCount(id), 5);
  assert.equal(((await addServiceBill("nope", jpeg(), staff)) as { status: number }).status, 404);
});

test("bills follow the entry's permission rule: author for 24 hours, admin always, others never", async () => {
  const id = await add("v2", { serviced_on: "2026-01-07" }, staff);
  const other = { id: "staff9", name: "Other", role: "staff" as const };
  assert.equal(((await addServiceBill(id, jpeg(), other)) as { status: number }).status, 403);
  const mine = (await addServiceBill(id, jpeg(1), staff)) as { id: string };
  assert.equal(((await deleteServiceBill(mine.id, other)) as { status: number }).status, 403);
  await DB.prepare("UPDATE service_records SET created_at = ? WHERE id = ?").bind(new Date(Date.now() - 30 * 3600_000).toISOString(), id).run();
  assert.equal(((await addServiceBill(id, jpeg(2), staff)) as { status: number }).status, 403, "author after 24 hours");
  assert.equal(((await deleteServiceBill(mine.id, staff)) as { status: number }).status, 403);
  assert.ok("ok" in (await addServiceBill(id, jpeg(3), admin)), "admin can");
  assert.ok("ok" in (await deleteServiceBill(mine.id, admin)));
});

test("removing a bill deletes the stored file; deleting an entry deletes all its bills and files", async () => {
  const id = await add("v2", { serviced_on: "2026-01-08" });
  const a = (await addServiceBill(id, jpeg(), staff)) as { id: string };
  await addServiceBill(id, pdf(), staff);
  assert.equal(await stored(`service/v2/${id}/`), 2);
  assert.ok("ok" in (await deleteServiceBill(a.id, staff)));
  assert.equal(await stored(`service/v2/${id}/`), 1);
  assert.ok("error" in (await deleteServiceBill(a.id, staff)), "already gone");
  assert.ok("ok" in (await deleteServiceRecord(id, staff)));
  assert.equal(await stored(`service/v2/${id}/`), 0, "no orphaned files");
  assert.equal(await billCount(id), 0, "no orphaned rows");
});
