import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";
import { TEST_DB_PORT, testEnv, usesExternalTestDb } from "../vitest.config";

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Empties the test database (its name is checked to end in _test). */
async function dropTestDatabase() {
  const prisma = new PrismaClient({ datasourceUrl: testEnv.DATABASE_URL });
  try {
    await prisma.$runCommandRaw({ dropDatabase: 1 });
  } finally {
    await prisma.$disconnect();
  }
}

function createCollections() {
  execFileSync(process.execPath, ["scripts/prisma.mjs", "db", "push", "--skip-generate"], {
    cwd: serverDir,
    env: { ...process.env, ...testEnv },
    stdio: "pipe",
  });
}

/**
 * Gives the tests an empty database with all collections and indexes.
 * - TEST_DATABASE_URL set: that database (name must end in _test), emptied
 *   before and after the run.
 * - Otherwise: a throwaway local MongoDB replica set (transactions need one);
 *   the first run downloads a MongoDB binary into the user's cache folder.
 */
export default async function setup() {
  rmSync(resolve(serverDir, "test/.tmp"), { recursive: true, force: true });
  if (usesExternalTestDb) {
    await dropTestDatabase();
    createCollections();
    return dropTestDatabase;
  }
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: "amftest", storageEngine: "wiredTiger", ip: "127.0.0.1" },
    instanceOpts: [{ port: TEST_DB_PORT }],
  });
  createCollections();
  return async () => {
    await replSet.stop();
  };
}
