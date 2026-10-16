-- Username login (Better Auth username plugin). Email stays required/unique but
-- can be a placeholder; either can be used to sign in.
ALTER TABLE "user" ADD COLUMN "username" TEXT;
ALTER TABLE "user" ADD COLUMN "displayUsername" TEXT;

-- Existing users: derive a username from the part of the email before '@'.
UPDATE "user" SET
  "username" = lower(CASE WHEN instr("email", '@') > 0 THEN substr("email", 1, instr("email", '@') - 1) ELSE "email" END),
  "displayUsername" = CASE WHEN instr("email", '@') > 0 THEN substr("email", 1, instr("email", '@') - 1) ELSE "email" END
WHERE "username" IS NULL;

CREATE UNIQUE INDEX "user_username_unique" ON "user" ("username");
