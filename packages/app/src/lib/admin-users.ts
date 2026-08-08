import { createDb, schema, hashPassword } from "@serviceos/platform";
import { generateTempPassword } from "./temp-password";

/** Shared by the bootstrap (static-token) and ongoing (admin-JWT) admin-account-creation routes. */
export async function createAdminUser(db: ReturnType<typeof createDb>, params: { name: string; email: string }) {
  const tempPassword = generateTempPassword();
  const id = crypto.randomUUID();
  await db.insert(schema.adminUsers).values({ id, name: params.name, email: params.email, password_hash: await hashPassword(tempPassword) });
  // No email delivery wired up (same as team invites) — whoever created this account shares the temp password directly.
  return { id, tempPassword };
}
