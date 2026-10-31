import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import * as schema from "./schema";

/**
 * DATABASE_URL set   → real Postgres (Render, Neon, local Docker…)
 * DATABASE_URL unset → embedded Postgres (PGlite) stored in ./.data, zero setup.
 *
 * Both drivers share the same schema and migrations.
 */

type DB = ReturnType<typeof drizzlePglite<typeof schema>>;

const g = globalThis as unknown as { __tendDb?: Promise<DB> };

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function create(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder: MIGRATIONS });
    // Same query API; cast keeps one DB type across the app.
    return db as unknown as DB;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (dir !== ":memory:") fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir === ":memory:" ? undefined : dir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return db;
}

export function getDb(): Promise<DB> {
  // Cache on globalThis so Next.js hot reload doesn't open a second PGlite.
  g.__tendDb ??= create();
  return g.__tendDb;
}

export { schema };
