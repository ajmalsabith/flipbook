import { createApp } from "./app";
import { startCron } from "./cron";
import { prepareDatabase, prisma } from "./db";
import { env } from "./env";

await prepareDatabase();
const app = createApp();
const server = app.listen(env.port, () => {
  console.log(`amflipbook server on http://localhost:${env.port} (${env.nodeEnv}), public URL ${env.publicUrl}`);
});
// Large flipbook uploads on slow phone connections can take a while.
server.requestTimeout = 10 * 60_000;
startCron();

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
