import { defineConfig } from "vitest/config";

// Tests use their own database and upload folder (relative to the repository
// root, like in .env), and never touch development or production data.
// The database is either TEST_DATABASE_URL (e.g. a separate "amflipbook_test"
// database on Atlas) or a throwaway local MongoDB started by
// test/globalSetup.ts on TEST_DB_PORT. Either way it is emptied for each run,
// so its name must end in "_test".
export const TEST_DB_PORT = 27917;

const externalUrl = process.env.TEST_DATABASE_URL?.trim();
export const usesExternalTestDb = !!externalUrl;
const testDatabaseUrl = externalUrl || `mongodb://127.0.0.1:${TEST_DB_PORT}/amflipbook_test?directConnection=true`;
if (!/^mongodb(\+srv)?:\/\/[^/]+\/[^/?]*_test(\?|$)/.test(testDatabaseUrl)) {
  throw new Error('The test database name must end in "_test" (it is emptied on every run).');
}

export const testEnv = {
  NODE_ENV: "test",
  DATABASE_URL: testDatabaseUrl,
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
    // The integration tests share one database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    // The first run downloads a MongoDB binary for the test database.
    hookTimeout: 600_000,
  },
});
