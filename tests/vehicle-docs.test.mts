import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { DB, PHOTOS, admin, jpeg, seedBasics, staff, teardown } from "./helpers.mts";
import {
  addDocFile, createDocument, currentDocuments, deleteDocFile, deleteDocument, documentSchema, listVehicleDocuments, updateDocument,
} from "../src/lib/vehicle-docs.ts";
import { insertVehicle, vehicleSchema } from "../src/lib/vehicles.ts";
import { daysLeft, docStatus, statusText } from "../src/lib/vehicle-docs-shared.ts";

before(seedBasics);
after(teardown);

const pdf = () => { const b = new Uint8Array(1500); b.set(new TextEncoder().encode("%PDF-1.4\n%x")); return b.buffer; };
const doc = (type: string, until = "") => documentSchema.parse({ doc_type: type, valid_until: until });
const stored = async (prefix: string) => (await PHOTOS.list({ prefix })).objects.length;
const vehicle = (reg: string) => vehicleSchema.parse({ registration_number: reg, make: "Tata", model: "Nexon", year: "2022", color: "", fuel_type: "petrol", transmission: "manual", seats: "5", odometer_km: "1000", daily_rate_paise: "2000", deposit_paise: "0", notes: "" });

test("status: valid through the date, 'soon' within 30 days, expired the day after", () => {
  const today = "2026-10-17";
  assert.deepEqual(docStatus(null, today), { status: "none", days: null });
  assert.deepEqual(docStatus("2026-10-17", today), { status: "soon", days: 0 }, "valid through today");
  assert.deepEqual(docStatus("2026-10-16", today), { status: "expired", days: -1 }, "expired yesterday");
  assert.deepEqual(docStatus("2026-11-16", today), { status: "soon", days: 30 }, "30 days is still 'soon'");
  assert.deepEqual(docStatus("2026-11-17", today), { status: "ok", days: 31 });
  assert.equal(daysLeft("2027-03-01", "2027-02-28"), 1, "month boundaries");
  assert.equal(daysLeft("2028-03-01", "2028-02-28"), 2, "leap year");
  assert.equal(statusText(docStatus("2026-10-16", today)), "Expired yesterday");
  assert.equal(statusText(docStatus("2026-10-07", today)), "Expired 10 days ago");
  assert.equal(statusText(docStatus("2026-10-17", today)), "Expires today");
  assert.equal(statusText(docStatus("2026-10-18", today)), "Expires tomorrow");
  assert.equal(statusText(docStatus("2026-10-27", today)), "Expires in 10 days");
  assert.equal(statusText(docStatus(null, today)), "No expiry date");
});

test("a document has a type and an optional valid-until date (which may be in the past)", () => {
  assert.equal(doc("insurance").valid_until, null);
  assert.equal(doc("puc", "2027-03-01").valid_until, "2027-03-01");
  assert.equal(doc("registration", "2020-01-01").valid_until, "2020-01-01", "an expired paper is still recorded");
  for (const bad of ["2026-02-31", "tomorrow", "2026/10/17", "1999-01-01", "2200-01-01"]) assert.ok(!documentSchema.safeParse({ doc_type: "puc", valid_until: bad }).success, bad);
  assert.ok(!documentSchema.safeParse({ doc_type: "license", valid_until: "" }).success, "only the three known types");
});

test("a vehicle can be added together with its papers, atomically", async () => {
  const r = await insertVehicle(vehicle("KL01Z1000"), [doc("insurance", "2027-01-10"), doc("registration")], admin.id);
  assert.ok("id" in r);
  const docs = await listVehicleDocuments((r as { id: string }).id);
  assert.deepEqual(docs.map((d) => [d.doc_type, d.valid_until]).sort(), [["insurance", "2027-01-10"], ["registration", null]]);
  assert.deepEqual(Object.keys((r as { docs: Record<string, string> }).docs).sort(), ["insurance", "registration"]);
  assert.ok(docs.every((d) => d.created_by_name === "Asha Admin"));
});

test("a duplicate registration number creates neither the vehicle nor its papers", async () => {
  const before = ((await DB.prepare("SELECT COUNT(*) n FROM vehicle_documents").first()) as { n: number }).n;
  const dup = await insertVehicle(vehicle("KL01Z1000"), [doc("puc", "2027-01-10")], admin.id);
  assert.ok("error" in dup);
  assert.equal(((await DB.prepare("SELECT COUNT(*) n FROM vehicle_documents").first()) as { n: number }).n, before, "no stray document rows");
});

test("files: photo or PDF, verified from the real bytes; size and count limits; nothing stored when refused", async () => {
  const d = (await createDocument("v1", doc("insurance", "2027-05-05"), staff)) as { id: string };
  assert.equal(((await addDocFile(d.id, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]).buffer, staff)) as { status: number }).status, 415, "PNG");
  assert.equal(((await addDocFile(d.id, new TextEncoder().encode("<script>x</script>").buffer as ArrayBuffer, staff)) as { status: number }).status, 415);
  const bigJpeg = new Uint8Array(700 * 1024); bigJpeg.set([0xff, 0xd8, 0xff]);
  assert.equal(((await addDocFile(d.id, bigJpeg.buffer, staff)) as { status: number }).status, 413);
  const bigPdf = new Uint8Array(3 * 1024 * 1024 + 5); bigPdf.set(new TextEncoder().encode("%PDF-1.4"));
  assert.equal(((await addDocFile(d.id, bigPdf.buffer, staff)) as { status: number }).status, 413);
  assert.equal(await stored(`vehicle-docs/v1/${d.id}/`), 0);
  assert.ok("ok" in (await addDocFile(d.id, jpeg(), staff)));
  assert.ok("ok" in (await addDocFile(d.id, pdf(), staff)));
  for (let n = 0; n < 3; n++) assert.ok("ok" in (await addDocFile(d.id, jpeg(n + 1), staff)));
  assert.equal(((await addDocFile(d.id, jpeg(9), staff)) as { status: number }).status, 409, "sixth file");
  assert.equal(((await addDocFile("nope", jpeg(), staff)) as { status: number }).status, 404);
  const files = (await listVehicleDocuments("v1")).find((x) => x.id === d.id)!.files;
  assert.equal(files.length, 5);
  assert.deepEqual([files[0].content_type, files[1].content_type], ["image/jpeg", "application/pdf"]);
  const keys = (await PHOTOS.list({ prefix: `vehicle-docs/v1/${d.id}/` })).objects.map((o) => o.key);
  assert.ok(keys.every((k) => k.startsWith("vehicle-docs/")), "stored under vehicle-docs/, outside the 365-day inspections rule");
});

test("renewing keeps the old paper as history; the newest of each type is the current one", async () => {
  const old = (await createDocument("v2", doc("insurance", "2026-01-31"), admin)) as { id: string };
  await DB.prepare("UPDATE vehicle_documents SET created_at = '2025-01-01T00:00:00.000Z' WHERE id = ?").bind(old.id).run();
  const renewed = (await createDocument("v2", doc("insurance", "2027-01-31"), staff)) as { id: string };
  await createDocument("v2", doc("puc", "2026-12-01"), staff);
  const all = await listVehicleDocuments("v2");
  assert.equal(all.filter((d) => d.doc_type === "insurance").length, 2, "both kept");
  const cur = currentDocuments(all);
  assert.equal(cur.insurance!.id, renewed.id);
  assert.equal(cur.insurance!.valid_until, "2027-01-31");
  assert.equal(cur.puc!.valid_until, "2026-12-01");
  assert.equal(cur.registration, undefined, "no registration recorded yet");
});

test("who can change a document: admin always; the author for 24 hours; nobody else", async () => {
  const d = (await createDocument("v1", doc("puc", "2026-09-01"), staff)) as { id: string };
  const other = { id: "staff9", name: "Other", role: "staff" as const };
  assert.match(String(((await updateDocument(d.id, "2027-09-01", other)) as { error: string }).error), /Only an admin/);
  assert.match(String(((await deleteDocument(d.id, other)) as { error: string }).error), /Only an admin/);
  assert.equal(((await addDocFile(d.id, jpeg(), other)) as { status: number }).status, 403);
  assert.ok("ok" in (await updateDocument(d.id, "2027-09-01", staff)), "the author, within 24 hours");
  assert.equal((await listVehicleDocuments("v1")).find((x) => x.id === d.id)!.valid_until, "2027-09-01");
  await DB.prepare("UPDATE vehicle_documents SET created_at = ? WHERE id = ?").bind(new Date(Date.now() - 30 * 3600_000).toISOString(), d.id).run();
  assert.ok("error" in (await updateDocument(d.id, "2028-09-01", staff)), "author after 24 hours");
  assert.equal(((await addDocFile(d.id, jpeg(), staff)) as { status: number }).status, 403);
  assert.ok("ok" in (await updateDocument(d.id, null, admin)), "admin can, and can clear the date");
});

test("removing a file deletes the stored copy; deleting a document deletes all its files", async () => {
  const d = (await createDocument("v3", doc("registration", "2030-01-01"), staff)) as { id: string };
  const a = (await addDocFile(d.id, jpeg(), staff)) as { id: string };
  await addDocFile(d.id, pdf(), staff);
  assert.equal(await stored(`vehicle-docs/v3/${d.id}/`), 2);
  assert.ok("ok" in (await deleteDocFile(a.id, staff)));
  assert.equal(await stored(`vehicle-docs/v3/${d.id}/`), 1);
  assert.equal(((await deleteDocFile(a.id, staff)) as { status: number }).status, 404, "already gone");
  assert.ok("ok" in (await deleteDocument(d.id, staff)));
  assert.equal(await stored(`vehicle-docs/v3/${d.id}/`), 0, "no orphaned files");
  assert.equal(((await DB.prepare("SELECT COUNT(*) n FROM vehicle_document_files WHERE document_id = ?").bind(d.id).first()) as { n: number }).n, 0, "no orphaned rows");
});

test("an unknown vehicle is refused", async () => {
  assert.deepEqual(await createDocument("nope", doc("puc"), staff), { error: "Vehicle not found" });
});
