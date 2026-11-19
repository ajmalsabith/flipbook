import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { testEnv } from "../vitest.config";

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Fresh database with all migrations applied, before any test runs. */
export default function setup() {
  rmSync(resolve(serverDir, "test/.tmp"), { recursive: true, force: true });
  execFileSync(process.execPath, ["scripts/prisma.mjs", "migrate", "deploy"], {
    cwd: serverDir,
    env: { ...process.env, ...testEnv },
    stdio: "pipe",
  });
}
