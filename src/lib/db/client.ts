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
 * Both drivers share the same schema and migrations. If DATABASE_URL is set but
 * can't be reached (a free Render database expires after 30 days), Tend falls
 * back to PGlite and says so on /api/health, rather than going dark mid-judging.
 * TEND_DB_FALLBACK=0 turns that off.
 */

type DB = ReturnType<typeof drizzlePglite<typeof schema>>;

const g = globalThis as unknown as { __tendDb?: Promise<DB>; __tendDbFallback?: string };

/** Why Tend is on the embedded database despite DATABASE_URL, if it is. */
export const dbFallbackReason = () => g.__tendDbFallback ?? null;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function create(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      return await createPg(url);
    } catch (e) {
      if (process.env.TEND_DB_FALLBACK === "0") throw e;
      g.__tendDbFallback = e instanceof Error ? e.message : String(e);
      console.error(`[tend] DATABASE_URL unreachable (${g.__tendDbFallback}); using the embedded database instead.`);
    }
  }
  return createPglite();
}

async function createPg(url: string): Promise<DB> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder: MIGRATIONS });
    // Same query API; cast keeps one DB type across the app.
    return db as unknown as DB;
  } catch (e) {
    await pool.end().catch(() => {});
    throw e;
  }
}

async function createPglite(): Promise<DB> {
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
