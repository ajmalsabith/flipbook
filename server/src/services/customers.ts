import type { Customer, Plan } from "@prisma/client";
import type { CustomerInfo } from "../../../shared/api";
import type { Tx } from "../db";
import { planStatus } from "./entitlement";
import { usernameCandidate } from "./ids";
import { DAY_MS } from "./time";

export const BCRYPT_ROUNDS = 11;

export function customerInfo(c: Customer & { plan?: Plan | null }, now = new Date()): CustomerInfo {
  return {
    id: c.id,
    username: c.username,
    name: c.name,
    whatsapp: c.whatsapp,
    email: c.email,
    planName: c.planName,
    planCode: c.plan?.code ?? null,
    planStatus: planStatus(c, now),
    planStartsAt: c.planStartsAt?.toISOString() ?? null,
    planExpiresAt: c.planExpiresAt?.toISOString() ?? null,
    downloadsAllowed: c.downloadsAllowed,
    downloadsUsed: c.downloadsUsed,
    watermark: c.watermark,
    shareLinkDays: c.shareLinkDays,
  };
}

export async function uniqueUsername(tx: Tx, name: string): Promise<string> {
  for (;;) {
    const candidate = usernameCandidate(name);
    if (!(await tx.customer.findUnique({ where: { username: candidate }, select: { id: true } }))) {
      return candidate;
    }
  }
}

/**
 * Moves the anonymous flipbooks a browser made (before logging in or before
 * the plan was approved) to the customer. With an active plan they also get
 * the plan's terms: no watermark and the plan's share-link lifetime.
 */
export async function claimVisitorFlipbooks(
  tx: Tx,
  visitorId: string,
  customer: Customer,
  now: Date
): Promise<number> {
  const books = await tx.flipbook.findMany({
    where: { visitorId, customerId: null, filesDeleted: false },
    select: { id: true },
  });
  if (books.length === 0) return 0;
  const ids = books.map((b) => b.id);
  await tx.flipbook.updateMany({ where: { id: { in: ids } }, data: { customerId: customer.id } });
  if (planStatus(customer, now) === "active" && !customer.disabled && !customer.watermark) {
    const linkExpiresAt = new Date(now.getTime() + customer.shareLinkDays * DAY_MS);
    await tx.flipbook.updateMany({ where: { id: { in: ids } }, data: { watermarked: false } });
    await tx.flipbook.updateMany({
      where: { id: { in: ids }, linkExpiresAt: { lt: linkExpiresAt } },
      data: { linkExpiresAt },
    });
  }
  return ids.length;
}
