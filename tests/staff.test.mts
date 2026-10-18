import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { verifyPassword } from "better-auth/crypto";
import { DB, admin, seedBasics, staff, teardown } from "./helpers.mts";
import { createStaff, listStaff, newStaffSchema, resetPassword, setDisabled, setRole } from "../src/lib/staff.ts";
import { getAuth } from "../src/lib/auth.ts";

before(seedBasics); // admin1 (admin) and staff1 (staff)
after(teardown);

const mk = (o: Record<string, string> = {}) => newStaffSchema.parse({ name: "New Person", username: "newperson", role: "staff", password: "long-enough-pass", ...o });
const row = async (id: string) => (await DB.prepare(`SELECT * FROM "user" WHERE id = ?`).bind(id).first<Record<string, unknown>>())!;
const signIn = (username: string, password: string) => getAuth().api.signInUsername({ body: { username, password } }).then(() => true, () => false);

test("validation: username, password length, role", () => {
  assert.ok(!newStaffSchema.safeParse({ name: "A", username: "ab", role: "staff", password: "long-enough-pass" }).success);
  assert.ok(!newStaffSchema.safeParse({ name: "A", username: "has space", role: "staff", password: "long-enough-pass" }).success);
  assert.ok(!newStaffSchema.safeParse({ name: "A", username: "okname", role: "staff", password: "short" }).success);
  assert.ok(!newStaffSchema.safeParse({ name: "A", username: "okname", role: "owner", password: "long-enough-pass" }).success);
  assert.ok(newStaffSchema.safeParse({ name: "A", username: "ok.name_1", role: "admin", password: "long-enough-pass" }).success);
});

test("an admin can create staff and other admins; they can sign in with the username", async () => {
  const s = (await createStaff(mk({ username: "newstaff", password: "staff-pass-12345" }))) as { id: string };
  const a = (await createStaff(mk({ name: "Second Admin", username: "Admin.Two", role: "admin", password: "admin-pass-12345" }))) as { id: string };
  assert.equal((await row(s.id)).role, "staff");
  assert.equal((await row(a.id)).role, "admin");
  assert.equal((await row(a.id)).username, "admin.two"); // stored lower-case, shown as typed
  assert.equal((await row(a.id)).displayUsername, "Admin.Two");
  assert.ok(await signIn("newstaff", "staff-pass-12345"));
  assert.ok(await signIn("ADMIN.TWO", "admin-pass-12345"), "username sign-in is case-insensitive");
  assert.ok(!(await signIn("newstaff", "wrong-password-1")));
  const hash = ((await DB.prepare(`SELECT password FROM account WHERE userId = ?`).bind(s.id).first()) as { password: string }).password;
  assert.notEqual(hash, "staff-pass-12345", "password is stored hashed");
  assert.ok(await verifyPassword({ hash, password: "staff-pass-12345" }));
});

test("duplicate usernames are refused (case-insensitive), including a race", async () => {
  assert.ok("error" in (await createStaff(mk({ username: "NEWSTAFF" }))));
  const results = await Promise.all([1, 2, 3].map(() => createStaff(mk({ username: "racer" }))));
  assert.equal(results.filter((r) => "ok" in r).length, 1);
  assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM "user" WHERE username = 'racer'`).first<{ n: number }>())!.n, 1);
});

test("disabling blocks sign-in and ends sessions; re-enabling restores it", async () => {
  const id = ((await DB.prepare(`SELECT id FROM "user" WHERE username = 'newstaff'`).first()) as { id: string }).id;
  const now = new Date().toISOString();
  await DB.prepare(`INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('s1','2099-01-01T00:00:00Z','tok1',?1,?1,?2),('s2','2099-01-01T00:00:00Z','tok2',?1,?1,?2)`).bind(now, id).run();
  assert.ok("ok" in (await setDisabled(id, true, admin.id)));
  assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM session WHERE userId = ?`).bind(id).first<{ n: number }>())!.n, 0, "all sessions deleted");
  assert.ok(!(await signIn("newstaff", "staff-pass-12345")), "disabled user cannot sign in");
  assert.ok("ok" in (await setDisabled(id, false, admin.id)));
  assert.ok(await signIn("newstaff", "staff-pass-12345"));
});

test("resetting a password: new one works, old one doesn't, sessions are ended", async () => {
  const id = ((await DB.prepare(`SELECT id FROM "user" WHERE username = 'newstaff'`).first()) as { id: string }).id;
  const now = new Date().toISOString();
  await DB.prepare(`INSERT OR IGNORE INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('s3','2099-01-01T00:00:00Z','tok3',?1,?1,?2)`).bind(now, id).run();
  assert.ok("ok" in (await resetPassword(id, "brand-new-pass-1")));
  assert.ok(await signIn("newstaff", "brand-new-pass-1"));
  assert.ok(!(await signIn("newstaff", "staff-pass-12345")));
  assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM session WHERE id = 's3'`).first<{ n: number }>())!.n, 0);
  assert.ok("error" in (await resetPassword("nobody", "brand-new-pass-1")));
});

test("you can't disable yourself or change your own role", async () => {
  assert.deepEqual(await setDisabled(admin.id, true, admin.id), { error: "You can't disable your own account" });
  assert.deepEqual(await setRole(admin.id, "staff", admin.id), { error: "You can't change your own role" });
  assert.equal((await row(admin.id)).disabled, 0);
});

test("roles: promote and demote", async () => {
  assert.ok("ok" in (await setRole(staff.id, "admin", admin.id)));
  assert.equal((await row(staff.id)).role, "admin");
  assert.ok("ok" in (await setRole(staff.id, "staff", admin.id)));
  assert.equal((await row(staff.id)).role, "staff");
});

test("the last active admin can never be disabled or demoted, even by a race", async () => {
  // Make a clean situation: exactly two active admins (admin1 and admin.two), everyone else staff.
  const a2 = ((await DB.prepare(`SELECT id FROM "user" WHERE username = 'admin.two'`).first()) as { id: string }).id;
  await DB.prepare(`UPDATE "user" SET role = 'staff' WHERE role = 'admin' AND id NOT IN (?1, ?2)`).bind(admin.id, a2).run();
  // Two admins try to disable each other at the same moment: exactly one may succeed.
  const [x, y] = await Promise.all([setDisabled(a2, true, admin.id), setDisabled(admin.id, true, a2)]);
  assert.equal([x, y].filter((r) => "ok" in r).length, 1, "only one of the two can be disabled");
  const active = (await DB.prepare(`SELECT COUNT(*) n FROM "user" WHERE role = 'admin' AND disabled = 0`).first<{ n: number }>())!.n;
  assert.equal(active, 1, "one active admin remains");
  const survivor = ((await DB.prepare(`SELECT id FROM "user" WHERE role = 'admin' AND disabled = 0`).first()) as { id: string }).id;
  const other = survivor === admin.id ? a2 : admin.id;
  // The survivor can't be disabled or demoted by anyone.
  assert.deepEqual(await setDisabled(survivor, true, other), { error: "At least one active admin must remain" });
  assert.deepEqual(await setRole(survivor, "staff", staff.id), { error: "At least one active admin must remain" });
  assert.equal((await row(survivor)).disabled, 0);
  // Re-enabling the other admin lets the survivor be demoted again.
  assert.ok("ok" in (await setDisabled(other, false, survivor)));
  assert.ok("ok" in (await setRole(survivor, "staff", other)));
});

test("listStaff returns everyone, disabled last", async () => {
  const list = await listStaff();
  assert.ok(list.length >= 5);
  const firstDisabled = list.findIndex((u) => u.disabled);
  if (firstDisabled >= 0) assert.ok(list.slice(firstDisabled).every((u) => u.disabled));
});
