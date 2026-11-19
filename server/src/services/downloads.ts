import type { MeResponse } from "../../../shared/api";
import { prisma, type Tx } from "../db";
import { decideDownload, type DownloadDecision } from "./entitlement";
import { getSettings } from "./settings";
import { startOfDayIST } from "./time";

export type DownloadActor =
  | { kind: "visitor"; visitorId: string; ip: string }
  | { kind: "customer"; customerId: number; ip: string };

async function freeCounts(tx: Tx | typeof prisma, visitorId: string, ip: string, now: Date) {
  const freeUsed = await tx.downloadEvent.count({ where: { visitorId, kind: "free" } });
  const ipUsedToday = await tx.downloadEvent.count({
    where: { ip, kind: "free", createdAt: { gte: startOfDayIST(now) } },
  });
  return { freeUsed, ipUsedToday };
}

async function decide(tx: Tx | typeof prisma, actor: DownloadActor, now: Date): Promise<DownloadDecision> {
  if (actor.kind === "customer") {
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: actor.customerId } });
    return decideDownload({ kind: "customer", plan: customer }, now);
  }
  const settings = await getSettings();
  const counts = await freeCounts(tx, actor.visitorId, actor.ip, now);
  return decideDownload(
    {
      kind: "visitor",
      ...counts,
      limits: {
        freeDownloadLimit: settings.freeDownloadLimit,
        freeIpDailyLimit: settings.freeIpDailyLimit,
      },
    },
    now
  );
}

export type ChargedDownload = DownloadDecision & { eventId?: number };

/**
 * Checks the allowance and records the download in ONE transaction, so two
 * downloads at the same moment can never both use the last free slot.
 */
export async function chargeDownload(
  actor: DownloadActor,
  flipbookId: string,
  now = new Date()
): Promise<ChargedDownload> {
  return prisma.$transaction(async (tx) => {
    const decision = await decide(tx, actor, now);
    if (!decision.allowed) return decision;
    if (actor.kind === "customer") {
      await tx.customer.update({
        where: { id: actor.customerId },
        data: { downloadsUsed: { increment: 1 } },
      });
    }
    const event = await tx.downloadEvent.create({
      data: {
        flipbookId,
        customerId: actor.kind === "customer" ? actor.customerId : null,
        visitorId: actor.kind === "visitor" ? actor.visitorId : null,
        ip: actor.ip,
        kind: decision.charge,
        watermarked: decision.watermark,
      },
    });
    await tx.flipbook.update({ where: { id: flipbookId }, data: { downloads: { increment: 1 } } });
    return { ...decision, eventId: event.id };
  });
}

/** Gives the download back if building the file failed after charging. */
export async function refundDownload(actor: DownloadActor, eventId: number, flipbookId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.downloadEvent.delete({ where: { id: eventId } });
    await tx.flipbook.update({ where: { id: flipbookId }, data: { downloads: { decrement: 1 } } });
    if (actor.kind === "customer") {
      await tx.customer.update({
        where: { id: actor.customerId },
        data: { downloadsUsed: { decrement: 1 } },
      });
    }
  });
}

/** What /api/me reports: free usage and whether the next download is allowed. */
export async function downloadSummary(
  actor: DownloadActor,
  now = new Date()
): Promise<Pick<MeResponse, "free" | "download">> {
  const settings = await getSettings();
  const visitorId = actor.kind === "visitor" ? actor.visitorId : null;
  const used = visitorId
    ? await prisma.downloadEvent.count({ where: { visitorId, kind: "free" } })
    : 0;
  const decision = await decide(prisma, actor, now);
  return {
    free: {
      used,
      limit: settings.freeDownloadLimit,
      remaining: Math.max(0, settings.freeDownloadLimit - used),
    },
    download: decision.allowed
      ? {
          allowed: true,
          watermark: decision.watermark,
          // Remaining *before* the next download.
          remaining: decision.remaining === null ? null : decision.remaining + 1,
        }
      : { allowed: false, reason: decision.reason },
  };
}
