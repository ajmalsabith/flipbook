import cron from "node-cron";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { hasValue, noValue, prisma } from "./db";
import { env } from "./env";
import { deleteFlipbookFiles } from "./services/flipbooks";
import { DAY_MS } from "./services/time";

/** Files of anonymous flipbooks are deleted this long after their link expires. */
const ANONYMOUS_GRACE_MS = 2 * DAY_MS;

export async function runMaintenance(now = new Date()) {
  // 1. Plans that ran out. (Access checks use planExpiresAt directly, so this
  //    only keeps the status column and reports accurate.)
  const plans = await prisma.customer.updateMany({
    where: { planStatus: "active", AND: [hasValue("planExpiresAt"), { planExpiresAt: { lte: now } }] },
    data: { planStatus: "expired" },
  });

  // 2. Anonymous flipbooks: delete the files 2 days after the link expired.
  const stale = await prisma.flipbook.findMany({
    where: {
      ...noValue("customerId"),
      filesDeleted: false,
      linkExpiresAt: { lt: new Date(now.getTime() - ANONYMOUS_GRACE_MS) },
    },
    select: { id: true },
  });
  for (const fb of stale) {
    await deleteFlipbookFiles(fb.id);
    await prisma.flipbook.update({ where: { id: fb.id }, data: { filesDeleted: true } });
  }

  // 3. One-time download links nobody used in time.
  const tokens = await prisma.instantToken.updateMany({
    where: { status: "active", expiresAt: { lte: now } },
    data: { status: "expired" },
  });

  // 4. Download lock rows (see db.ts lock()) are only needed for a moment.
  await prisma.lock.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - 2 * DAY_MS) } } });

  // 5. Upload leftovers (interrupted uploads).
  let tmpRemoved = 0;
  const tmpDir = join(env.uploadDir, ".tmp");
  for (const name of await readdir(tmpDir).catch(() => [] as string[])) {
    const path = join(tmpDir, name);
    const info = await stat(path).catch(() => null);
    if (info && now.getTime() - info.mtimeMs > DAY_MS) {
      await rm(path, { force: true, recursive: true });
      tmpRemoved++;
    }
  }

  return {
    plansExpired: plans.count,
    flipbookFilesDeleted: stale.length,
    instantLinksExpired: tokens.count,
    tmpRemoved,
  };
}

async function runAndLog() {
  try {
    const result = await runMaintenance();
    console.log(`[maintenance] ${new Date().toISOString()}`, result);
  } catch (err) {
    console.error("[maintenance] failed:", err);
  }
}

export function startCron(): void {
  // Every night at 03:15 Indian time, and once shortly after start-up.
  cron.schedule("15 3 * * *", runAndLog, { timezone: "Asia/Kolkata" });
  setTimeout(runAndLog, 15_000).unref();
}
