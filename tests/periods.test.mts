import { test } from "node:test";
import assert from "node:assert/strict";
import { istDateInput, periodDays, resolvePeriod } from "../src/lib/periods.ts";

const at = (iso: string) => new Date(iso).getTime();
const r = (p: Record<string, string>, now: string) => { const x = resolvePeriod(p, at(now)); return [x.start, x.end, x.label]; };
const NOW = "2026-10-17T04:30:00Z"; // Saturday 17 Oct 2026, 10:00 IST

test("preset periods are whole IST days, start inclusive / end exclusive", () => {
  assert.deepEqual(r({ p: "today" }, NOW), ["2026-10-16T18:30:00.000Z", "2026-10-17T18:30:00.000Z", "17 Oct 2026"]);
  assert.deepEqual(r({ p: "week" }, NOW), ["2026-10-11T18:30:00.000Z", "2026-10-18T18:30:00.000Z", "12 Oct 2026 – 18 Oct 2026"]);
  assert.deepEqual(r({ p: "month" }, NOW), ["2026-09-30T18:30:00.000Z", "2026-10-31T18:30:00.000Z", "October 2026"]);
  assert.deepEqual(r({ p: "last_month" }, NOW), ["2026-08-31T18:30:00.000Z", "2026-09-30T18:30:00.000Z", "September 2026"]);
  assert.deepEqual(r({ p: "year" }, NOW), ["2025-12-31T18:30:00.000Z", "2026-12-31T18:30:00.000Z", "2026"]);
});

test("financial year runs 1 April to 31 March and flips at 00:00 IST on 1 April", () => {
  assert.deepEqual(r({ p: "fy" }, NOW), ["2026-03-31T18:30:00.000Z", "2027-03-31T18:30:00.000Z", "FY 2026–27"]);
  assert.equal(r({ p: "last_fy" }, NOW)[2], "FY 2025–26");
  assert.equal(r({ p: "fy" }, "2027-02-10T06:00:00Z")[2], "FY 2026–27");
  assert.equal(r({ p: "fy" }, "2027-03-31T18:29:00Z")[2], "FY 2026–27"); // 31 Mar 23:59 IST
  assert.equal(r({ p: "fy" }, "2027-03-31T18:30:00Z")[2], "FY 2027–28"); // 1 Apr 00:00 IST
});

test("India's day boundary is 18:30 UTC", () => {
  assert.equal(r({ p: "today" }, "2026-10-16T18:45:00Z")[2], "17 Oct 2026");
  assert.equal(r({ p: "today" }, "2026-10-16T18:15:00Z")[2], "16 Oct 2026");
});

test("weeks start on Monday", () => {
  assert.equal(r({ p: "week" }, "2026-10-18T10:00:00Z")[0], "2026-10-11T18:30:00.000Z"); // Sunday -> Monday 12
  assert.equal(r({ p: "week" }, "2026-10-19T04:00:00Z")[0], "2026-10-18T18:30:00.000Z"); // Monday 19
});

test("last month crosses the year boundary", () => {
  assert.equal(r({ p: "last_month" }, "2027-01-15T06:00:00Z")[2], "December 2026");
});

test("custom range is inclusive of the end day and validated", () => {
  assert.deepEqual(r({ p: "custom", from: "2026-10-01", to: "2026-10-31" }, NOW), ["2026-09-30T18:30:00.000Z", "2026-10-31T18:30:00.000Z", "1 Oct 2026 – 31 Oct 2026"]);
  assert.equal(periodDays(resolvePeriod({ p: "custom", from: "2026-10-05", to: "2026-10-05" }, at(NOW))), 1);
  const reversed = resolvePeriod({ p: "custom", from: "2026-10-31", to: "2026-10-01" }, at(NOW));
  assert.equal(reversed.error, "The end date is before the start date");
  assert.equal(reversed.label, "October 2026"); // falls back to the current month
  assert.ok(resolvePeriod({ p: "custom", from: "2026-02-31", to: "2026-03-05" }, at(NOW)).error, "impossible date");
  assert.ok(resolvePeriod({ p: "custom", from: "abc", to: "xyz" }, at(NOW)).error);
  assert.ok(resolvePeriod({ p: "custom", from: "2020-01-01", to: "2026-01-01" }, at(NOW)).error, "more than 800 days");
  assert.equal(resolvePeriod({ p: "custom" }, at(NOW)).error, undefined, "no dates yet is not an error");
  assert.equal(r({ p: "bogus" }, NOW)[2], "October 2026");
});

test("day counts including leap years", () => {
  const d = (p: string, now: string) => periodDays(resolvePeriod({ p }, at(now)));
  assert.deepEqual([d("month", NOW), d("month", "2027-02-10T06:00:00Z"), d("fy", NOW), d("month", "2028-02-10T06:00:00Z")], [31, 28, 365, 29]);
  assert.equal(istDateInput(at("2026-10-16T18:30:00Z")), "2026-10-17");
});
