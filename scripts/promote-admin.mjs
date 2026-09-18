#!/usr/bin/env node
// Ops tool: there is no UI for granting the admin role, on purpose — this is
// a deliberate, auditable, out-of-band step an operator runs directly against
// the database. Requires DATABASE_URL.
// Usage: node scripts/promote-admin.mjs <userId> [admin|player]
import { createPool, migrate } from "../server/database.js";
import { PostgresIdentityStore } from "../server/identity-store.js";

const [, , userId, role = "admin"] = process.argv;
if (!userId || !["admin", "player"].includes(role)) {
  console.error("Usage: node scripts/promote-admin.mjs <userId> [admin|player]");
  process.exit(1);
}

const pool = createPool();
await migrate(pool);
const store = new PostgresIdentityStore(pool);
await store.setUserRole(userId, role);
console.log(JSON.stringify({ event: "role_set", userId, role }));
await pool.end();
