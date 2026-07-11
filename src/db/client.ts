import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Lazy initialization: calling neon() at module load time would crash
// `next build` before DATABASE_URL is provisioned (e.g. first deploy before
// the Neon Marketplace integration is installed). Do not wrap this in a
// Proxy — Proxy wrappers break libraries (e.g. auth adapters) that probe the
// client object's shape.
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    const sql = neon(process.env.DATABASE_URL!);
    _db = drizzle(sql, { schema });
  }
  return _db;
}
