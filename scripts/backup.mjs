// npm run backup
//
// Backs up the MongoDB database (mongodump, safe while the app is running)
// and a .tar.gz of the uploads folder into BACKUP_DIR/<date-time>/. Keeps the
// newest BACKUP_KEEP backups (default 14). Run it nightly from cron; see
// README.md. Needs MongoDB's database tools (mongodump) on the server.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const file = join(rootDir, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}
loadEnv();

const fromRoot = (p) => (isAbsolute(p) ? p : resolve(rootDir, p));
const dbUrl = process.env.DATABASE_URL ?? "";
if (!/^mongodb(\+srv)?:\/\//.test(dbUrl)) {
  console.error("DATABASE_URL in .env must be a MongoDB connection string.");
  process.exit(1);
}
const uploadDir = fromRoot(process.env.UPLOAD_DIR ?? "./uploads");
const backupRoot = fromRoot(process.env.BACKUP_DIR ?? "./backups");
const keep = Math.max(1, Number(process.env.BACKUP_KEEP ?? 14));

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const target = join(backupRoot, stamp);
mkdirSync(target, { recursive: true });

// 1. Database. The connection string (it contains the password) goes in a
//    private config file, not on the command line where `ps` would show it.
const archive = join(target, "database.archive.gz");
const configFile = join(target, ".mongodump.yaml");
writeFileSync(configFile, `uri: ${JSON.stringify(dbUrl)}\n`, { mode: 0o600 });
let dump;
try {
  dump = spawnSync("mongodump", [`--config=${configFile}`, `--archive=${archive}`, "--gzip", "--quiet"], {
    stdio: "inherit",
  });
} finally {
  rmSync(configFile, { force: true });
}
if (dump.error || dump.status !== 0) {
  console.error(
    dump.error?.code === "ENOENT"
      ? "mongodump not found. Install MongoDB Database Tools (see README.md, Backups)."
      : "mongodump failed."
  );
  process.exitCode = 1;
} else {
  console.log(`database  -> ${archive} (${(statSync(archive).size / 1024).toFixed(0)} KB)`);
}

// 2. Uploaded files.
if (existsSync(uploadDir)) {
  const uploads = join(target, "uploads.tar.gz");
  // Relative archive name: GNU tar reads "C:..." as a remote host on Windows.
  const result = spawnSync(
    "tar",
    ["-czf", "uploads.tar.gz", "--exclude", ".tmp", "-C", dirname(uploadDir), basename(uploadDir)],
    { stdio: "inherit", cwd: target }
  );
  if (result.status !== 0) {
    console.error("tar failed.");
    process.exitCode = 1;
  } else {
    console.log(`uploads   -> ${uploads} (${(statSync(uploads).size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

// 3. Keep only the newest backups (only after a fully successful run).
if (!process.exitCode) {
  const old = readdirSync(backupRoot)
    .filter((name) => /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(name))
    .sort()
    .reverse()
    .slice(keep);
  for (const name of old) {
    rmSync(join(backupRoot, name), { recursive: true, force: true });
    console.log(`removed old backup ${name}`);
  }
}
