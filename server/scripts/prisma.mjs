// Runs the Prisma CLI with the repository's root .env loaded, so the CLI and
// the server always use the same DATABASE_URL (values already set in the
// environment win, which is how the tests point it at their own database).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = resolve(serverDir, "..");

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

loadEnvFile(resolve(rootDir, ".env"));

const command = process.argv.slice(2);
// `prisma generate` only reads the schema; everything else needs a database.
if (command[0] !== "generate" && !/^mongodb(\+srv)?:\/\//.test(process.env.DATABASE_URL ?? "")) {
  console.error("DATABASE_URL in .env must be a MongoDB connection string (mongodb+srv://...).");
  process.exit(1);
}

const cli = resolve(serverDir, "node_modules/prisma/build/index.js");
const fallback = resolve(rootDir, "node_modules/prisma/build/index.js");
const entry = existsSync(cli) ? cli : fallback;
const result = spawnSync(
  process.execPath,
  [entry, ...command, "--schema", resolve(serverDir, "prisma/schema.prisma")],
  { stdio: "inherit", cwd: serverDir, env: process.env }
);
process.exit(result.status ?? 1);
