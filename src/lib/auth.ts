import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { env } from "./env";

// Built per request: D1/R2 bindings only exist inside a request on Workers.
export function getAuth() {
  const e = env();
  return betterAuth({
    database: e.DB,
    secret: e.BETTER_AUTH_SECRET,
    baseURL: e.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // users are created by the admin script only
      minPasswordLength: 10,
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "staff", input: false },
        disabled: { type: "number", required: false, defaultValue: 0, input: false },
      },
    },
    rateLimit: { enabled: true, storage: "database" },
    // On Cloudflare the client address is in cf-connecting-ip (set by Cloudflare, not forgeable by the client),
    // so login rate limits apply per person instead of one shared bucket.
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    session: { expiresIn: 60 * 60 * 24 * 30, cookieCache: { enabled: false } },
    databaseHooks: {
      session: {
        create: {
          // A disabled account can't start a session (existing sessions are deleted when it is disabled).
          before: async (session) => {
            const u = await e.DB.prepare(`SELECT disabled FROM "user" WHERE id = ?`).bind(session.userId).first<{ disabled: number }>();
            if (u?.disabled) return false;
          },
        },
      },
    },
    plugins: [username({ minUsernameLength: 3 }), nextCookies()],
  });
}
