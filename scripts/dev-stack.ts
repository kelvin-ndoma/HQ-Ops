import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";

async function main() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri("hqops");
  const env = {
    ...process.env,
    MONGODB_URI: uri,
    AUTH_SECRET: process.env.AUTH_SECRET || "dev-only-hq-ops-secret-change",
    SEED_PASSWORD: process.env.SEED_PASSWORD || "ChangeMe-HQ-2026",
  };

  const seed = spawn("npx", ["tsx", "src/server/seed.ts"], { stdio: "inherit", env });
  const seeded = await new Promise<number>((resolve) => seed.on("exit", (code) => resolve(code ?? 1)));
  if (seeded !== 0) {
    await replSet.stop();
    process.exit(seeded);
  }

  const next = spawn("npx", ["next", "dev"], { stdio: "inherit", env });
  const stop = async () => {
    next.kill("SIGTERM");
    await replSet.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
