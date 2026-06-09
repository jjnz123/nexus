import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof postgres> | undefined;
  db: Db | undefined;
};

function createDb(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalForDb.client) {
    globalForDb.client = postgres(connectionString, { max: 10 });
  }
  if (!globalForDb.db) {
    globalForDb.db = drizzle(globalForDb.client, { schema });
  }
  return globalForDb.db;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(createDb(), prop, receiver);
  },
});

export function getSqlClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalForDb.client) {
    globalForDb.client = postgres(connectionString, { max: 10 });
  }
  return globalForDb.client;
}

export { schema };
