// Prints SQL that inserts a Better Auth user + credential account.
// Usage:
//   USER_PASSWORD='...' node scripts/create-user.mjs <email> "<name>" <admin|staff> > /tmp/u.sql
//   npx wrangler d1 execute car-rental --local  --file /tmp/u.sql
//   npx wrangler d1 execute car-rental --remote --file /tmp/u.sql
import { hashPassword } from "better-auth/crypto";

const [email, name, role] = process.argv.slice(2);
const password = process.env.USER_PASSWORD;
if (!email || !name || !["admin", "staff"].includes(role) || !password) {
  console.error('Usage: USER_PASSWORD=... node scripts/create-user.mjs <email> "<name>" <admin|staff>');
  process.exit(1);
}
if (password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const now = new Date().toISOString();
const userId = crypto.randomUUID();
const hash = await hashPassword(password);
console.log(
  `INSERT INTO "user" (id,name,email,emailVerified,role,createdAt,updatedAt) VALUES (${q(userId)},${q(name)},${q(email.toLowerCase())},1,${q(role)},${q(now)},${q(now)});\n` +
    `INSERT INTO "account" (id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES (${q(crypto.randomUUID())},${q(userId)},'credential',${q(userId)},${q(hash)},${q(now)},${q(now)});`,
);
