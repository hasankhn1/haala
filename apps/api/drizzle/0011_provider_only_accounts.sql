-- Accounts that arrive through a provider have no password.
--
-- Someone who signs in with Google never sets one, and storing a fake hash to
-- keep the column NOT NULL would be a lie that `bcrypt.compare` would then be
-- asked to evaluate. Nullable is the honest shape; `verifyPassword` is the one
-- place that reads it, and it answers false for null while spending the same
-- time as a real comparison.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
