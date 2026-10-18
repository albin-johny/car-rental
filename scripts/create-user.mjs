// Prints SQL that inserts a Better Auth user + credential account.
// Users sign in with their username (or email).
// Usage:
//   USER_PASSWORD='...' node scripts/create-user.mjs <username> "<name>" <admin|staff> [email] > u.sql
//   npx wrangler d1 execute car-rental --local  --file u.sql
//   npx wrangler d1 execute car-rental --remote --file u.sql
// If no email is given, a placeholder <username>@car-rental.local is stored.
import { hashPassword } from "better-auth/crypto";

const [username, name, role, emailArg] = process.argv.slice(2);
const password = process.env.USER_PASSWORD;
if (!username || !name || !["admin", "staff"].includes(role) || !password) {
  console.error('Usage: USER_PASSWORD=... node scripts/create-user.mjs <username> "<name>" <admin|staff> [email]');
  process.exit(1);
}
if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
  console.error("Username: 3-30 characters, letters, digits, underscore or dot.");
  process.exit(1);
}
if (password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const now = new Date().toISOString();
const userId = crypto.randomUUID();
const email = (emailArg || `${username}@car-rental.local`).toLowerCase();
const hash = await hashPassword(password);
console.log(
  `INSERT INTO "user" (id,name,email,emailVerified,role,username,displayUsername,createdAt,updatedAt) VALUES (${q(userId)},${q(name)},${q(email)},1,${q(role)},${q(username.toLowerCase())},${q(username)},${q(now)},${q(now)});\n` +
    `INSERT INTO "account" (id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES (${q(crypto.randomUUID())},${q(userId)},'credential',${q(userId)},${q(hash)},${q(now)},${q(now)});`,
);
