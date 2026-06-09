import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";
import { runMonitorCycle } from "../src/server/jobs/monitor-runner";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 5 });
  const db = drizzle(client, { schema });

  console.log("Monitor worker started");

  const tick = async () => {
    try {
      await runMonitorCycle(db);
    } catch (err) {
      console.error("Monitor cycle error:", err);
    }
  };

  await tick();
  setInterval(tick, 15_000);

  process.on("SIGTERM", async () => {
    await client.end();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
