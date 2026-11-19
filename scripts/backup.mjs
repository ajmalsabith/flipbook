// npm run backup
//
// Makes a consistent copy of the SQLite database (VACUUM INTO, safe while the
// app is running) and a .tar.gz of the uploads folder, in
// BACKUP_DIR/<date-time>/. Keeps the newest BACKUP_KEEP backups (default 14).
// Run it nightly from cron; see README.md.

import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
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
const dbUrl = process.env.DATABASE_URL ?? "file:./data/amflipbook.db";
if (!dbUrl.startsWith("file:")) {
  console.error("This script backs up SQLite only. For MySQL use mysqldump.");
  process.exit(1);
}
const dbPath = fromRoot(dbUrl.slice(5).split("?")[0]);
const uploadDir = fromRoot(process.env.UPLOAD_DIR ?? "./uploads");
const backupRoot = fromRoot(process.env.BACKUP_DIR ?? "./backups");
const keep = Math.max(1, Number(process.env.BACKUP_KEEP ?? 14));

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const target = join(backupRoot, stamp);
mkdirSync(target, { recursive: true });

// 1. Database snapshot.
const dbCopy = join(target, "amflipbook.db");
const prisma = new PrismaClient({ datasourceUrl: `file:${dbPath.replace(/\\/g, "/")}` });
try {
  await prisma.$executeRawUnsafe(`VACUUM INTO '${dbCopy.replace(/\\/g, "/").replace(/'/g, "''")}'`);
} finally {
  await prisma.$disconnect();
}
console.log(`database  -> ${dbCopy} (${(statSync(dbCopy).size / 1024).toFixed(0)} KB)`);

// 2. Uploaded files.
if (existsSync(uploadDir)) {
  const archive = join(target, "uploads.tar.gz");
  // Relative archive name: GNU tar reads "C:..." as a remote host on Windows.
  const result = spawnSync(
    "tar",
    ["-czf", "uploads.tar.gz", "--exclude", ".tmp", "-C", dirname(uploadDir), basename(uploadDir)],
    { stdio: "inherit", cwd: target }
  );
  if (result.status !== 0) {
    console.error("tar failed; the database backup is still complete.");
    process.exitCode = 1;
  } else {
    console.log(`uploads   -> ${archive} (${(statSync(archive).size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

// 3. Keep only the newest backups.
const old = readdirSync(backupRoot)
  .filter((name) => /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(name))
  .sort()
  .reverse()
  .slice(keep);
for (const name of old) {
  rmSync(join(backupRoot, name), { recursive: true, force: true });
  console.log(`removed old backup ${name}`);
}
