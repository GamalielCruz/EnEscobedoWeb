import assert from "node:assert/strict";
import test from "node:test";
import { isAdminUser } from "./admin.ts";

test("solo IDs configurados pueden modificar la administración", () => {
  const previous = process.env.ADMIN_USER_IDS;
  process.env.ADMIN_USER_IDS = "user_admin,user_finance";
  assert.equal(isAdminUser("user_admin"), true);
  assert.equal(isAdminUser("user_restaurant"), false);
  if (previous == null) delete process.env.ADMIN_USER_IDS;
  else process.env.ADMIN_USER_IDS = previous;
});
