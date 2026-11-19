import { config as loadDotenv } from "dotenv";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// server/src/env.ts in development, server/dist/index.js once bundled: both
// sit two levels below the repository root.
export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

loadDotenv({ path: resolve(rootDir, ".env"), quiet: true });

function fromRoot(path: string): string {
  return isAbsolute(path) ? path : resolve(rootDir, path);
}

function databaseUrl(raw: string): string {
  if (!raw.startsWith("file:")) return raw;
  const [path, query] = raw.slice("file:".length).split("?");
  const absolute = fromRoot(path);
  mkdirSync(dirname(absolute), { recursive: true });
  // One connection: SQLite allows a single writer anyway, and it makes every
  // transaction (e.g. "check the download limit, then count the download")
  // run strictly one after another.
  const params = new URLSearchParams(query ?? "");
  if (!params.has("connection_limit")) params.set("connection_limit", "1");
  return `file:${absolute.replace(/\\/g, "/")}?${params.toString()}`;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProd = nodeEnv === "production";

function secret(name: string): string {
  const value = process.env[name] ?? "";
  const weak = value.length < 32 || value.startsWith("change-me");
  if (weak) {
    if (isProd) {
      throw new Error(`${name} must be set to a random string of at least 32 characters in .env`);
    }
    return `dev-only-${name}-not-for-production-use-000000`;
  }
  return value;
}

export const env = {
  nodeEnv,
  isProd,
  isTest: nodeEnv === "test",
  port: Number(process.env.PORT ?? 4000),
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:5173").replace(/\/+$/, ""),
  trustProxy: Number(process.env.TRUST_PROXY ?? 1),
  jwtSecret: secret("JWT_SECRET"),
  cookieSecret: secret("COOKIE_SECRET"),
  databaseUrl: databaseUrl(process.env.DATABASE_URL ?? "file:./data/amflipbook.db"),
  uploadDir: fromRoot(process.env.UPLOAD_DIR ?? "./uploads"),
  backupDir: fromRoot(process.env.BACKUP_DIR ?? "./backups"),
  webDist: resolve(rootDir, "web/dist"),
  adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  adminWhatsapp: (process.env.ADMIN_WHATSAPP ?? "919999999999").replace(/\D/g, ""),
  brandLogoPath: fromRoot(process.env.BRAND_LOGO_PATH ?? "./web/public/brand/logo.svg"),
};

mkdirSync(env.uploadDir, { recursive: true });
