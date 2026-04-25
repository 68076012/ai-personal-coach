import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Sql = ReturnType<typeof postgres>;
type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  pgClient?: Sql;
  pgDb?: Db;
};

function buildClient(): Sql {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local before calling the database.",
    );
  }
  return postgres(connectionString, {
    max: 10,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

export function getDb(): Db {
  if (!globalForDb.pgDb) {
    globalForDb.pgClient = globalForDb.pgClient ?? buildClient();
    globalForDb.pgDb = drizzle(globalForDb.pgClient, { schema });
  }
  return globalForDb.pgDb;
}

export const db: Db = new Proxy({} as Db, {
  get(_, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
