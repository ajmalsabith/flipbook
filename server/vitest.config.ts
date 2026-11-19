import { defineConfig } from "vitest/config";

// Tests use their own database and upload folder (paths are relative to the
// repository root, like in .env) and never touch development data.
export const testEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "file:./server/test/.tmp/test.db",
  UPLOAD_DIR: "./server/test/.tmp/uploads",
  PUBLIC_URL: "http://amflipbook.test",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "test-admin-password",
  ADMIN_WHATSAPP: "919000000001",
  JWT_SECRET: "test-jwt-secret-0123456789-0123456789-abcdef",
  COOKIE_SECRET: "test-cookie-secret-0123456789-0123456789-abcdef",
};

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    env: testEnv,
    // The integration tests share one SQLite file, so run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
