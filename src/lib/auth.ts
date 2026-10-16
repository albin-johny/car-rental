import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
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
      },
    },
    rateLimit: { enabled: true, storage: "database" },
    session: { expiresIn: 60 * 60 * 24 * 30, cookieCache: { enabled: false } },
    plugins: [nextCookies()],
  });
}
