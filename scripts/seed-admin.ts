import "dotenv/config";
import bcrypt from "bcryptjs";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  const [result] = await db.select({ value: count() }).from(schema.users);
  if ((result?.value ?? 0) > 0) {
    console.log("Users already exist, skipping seed");
    await client.end();
    return;
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@localhost";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";
  const passwordHash = await bcrypt.hash(password, 12);

  await db.insert(schema.users).values({
    email: email.toLowerCase(),
    name,
    passwordHash,
    role: "admin",
  });

  console.log(`Seeded admin user: ${email}`);
  await client.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
