// Runs the Prisma CLI with the repository's root .env loaded and a relative
// SQLite path ("file:./data/amflipbook.db") resolved against the repo root,
// so the CLI and the server always use the same database file.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
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

let url = process.env.DATABASE_URL || "file:./data/amflipbook.db";
if (url.startsWith("file:")) {
  const path = url.slice("file:".length);
  const absolute = isAbsolute(path) ? path : resolve(rootDir, path);
  mkdirSync(dirname(absolute), { recursive: true });
  url = "file:" + absolute.replace(/\\/g, "/");
}
process.env.DATABASE_URL = url;

const cli = resolve(serverDir, "node_modules/prisma/build/index.js");
const fallback = resolve(rootDir, "node_modules/prisma/build/index.js");
const entry = existsSync(cli) ? cli : fallback;
const result = spawnSync(
  process.execPath,
  [entry, ...process.argv.slice(2), "--schema", resolve(serverDir, "prisma/schema.prisma")],
  { stdio: "inherit", cwd: serverDir, env: process.env }
);
process.exit(result.status ?? 1);
