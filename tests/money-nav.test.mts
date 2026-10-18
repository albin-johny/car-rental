import { test } from "node:test";
import assert from "node:assert/strict";
import { formatINR, formatINRShort, paiseToInput, rupeesToPaise } from "../src/lib/money.ts";
import { istInputToIso, isoToIstInput, relativeDue } from "../src/lib/time.ts";
import { rentalDays, suggestTotalPaise } from "../src/lib/rental-constants.ts";
import { safeBack, selfUrl, withBack } from "../src/lib/nav.ts";
import { normalizePhone } from "../src/lib/customers.ts";

test("rupees to integer paise with no float errors", () => {
  const cases: [string, number | null][] = [["1500", 150000], ["1,500.5", 150050], ["1500.50", 150050], ["0.07", 7], ["19.99", 1999], ["1.234", null], ["-5", null], ["abc", null], ["", null], ["0.1", 10]];
  for (const [input, want] of cases) assert.equal(rupeesToPaise(input), want, input);
  assert.equal(paiseToInput(250050), "2500.50");
  assert.equal(paiseToInput(250000), "2500");
  assert.equal(paiseToInput(7), "0.07");
});

test("Indian number grouping", () => {
  assert.equal(formatINR(123456789), "₹12,34,567.89");
  assert.equal(formatINRShort(123456700), "₹12,34,567");
  assert.equal(formatINRShort(250050), "₹2,500.50");
});

test("IST form values convert to UTC and back", () => {
  assert.equal(istInputToIso("2026-10-20T10:30"), "2026-10-20T05:00:00.000Z");
  assert.equal(isoToIstInput("2026-10-20T05:00:00.000Z"), "2026-10-20T10:30");
  assert.equal(istInputToIso("nope"), null);
});

test("price suggestion: 24-hour blocks rounded up, minimum 1 day", () => {
  const rate = 250000;
  assert.equal(rentalDays("2030-01-10T04:30:00.000Z", "2030-01-12T04:30:00.000Z"), 2);
  assert.equal(rentalDays("2030-01-10T04:30:00.000Z", "2030-01-12T04:30:01.000Z"), 3);
  assert.equal(rentalDays("2030-01-10T04:30:00.000Z", "2030-01-10T05:30:00.000Z"), 1);
  assert.equal(suggestTotalPaise("2030-01-10T04:30:00.000Z", "2030-01-13T04:30:00.000Z", rate), 750000);
});

test("phones normalise to digits; +91 / 91 / leading 0 are dropped", () => {
  for (const p of ["+91 98765-43210", "919876543210", "09876543210", "98765 43210"]) assert.equal(normalizePhone(p), "9876543210", p);
  assert.equal(normalizePhone("12"), null);
});

test("relative due times", () => {
  const now = new Date("2026-10-17T05:00:00Z").getTime();
  assert.deepEqual(relativeDue("2026-10-17T08:00:00Z", now), { text: "in 3h", overdue: false });
  assert.deepEqual(relativeDue("2026-10-17T04:00:00Z", now), { text: "1h overdue", overdue: true });
  assert.deepEqual(relativeDue("2026-10-15T05:00:00Z", now), { text: "2d overdue", overdue: true });
});

test("back targets: only in-app paths are accepted, nesting round-trips", () => {
  for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "evil", ""]) assert.equal(safeBack(bad, "/x"), "/x", bad);
  assert.equal(safeBack(undefined, "/x"), "/x");
  const list = selfUrl("/rentals", { tab: "past", q: "ravi kumar" });
  assert.equal(safeBack(list, "/x"), list, "filters with spaces survive");
  const rental = withBack("/rentals/r1", list);
  const nested = selfUrl("/rentals/r1", { back: new URL(rental, "http://x").searchParams.get("back")! });
  const vehicle = withBack("/vehicles/v1", nested);
  const inner = new URL(vehicle, "http://x").searchParams.get("back")!;
  assert.equal(inner, nested);
  assert.equal(new URL(inner, "http://x").searchParams.get("back"), list, "the original list is recoverable two levels down");
});
