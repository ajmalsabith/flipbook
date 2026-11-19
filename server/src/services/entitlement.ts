// Who may download what, and on which terms. Pure functions only: the
// callers load the numbers from the database (inside a transaction) and
// record the outcome. Covered by test/entitlement.test.ts.

import type { DenyReason, LinkStatus, PlanStatus } from "../../../shared/api";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The plan terms stored on a customer when a request is approved. */
export type CustomerPlan = {
  planExpiresAt: Date | null;
  /** null = unlimited */
  downloadsAllowed: number | null;
  downloadsUsed: number;
  watermark: boolean;
  shareLinkDays: number;
  disabled: boolean;
};

export type FreeLimits = {
  /** Downloads per visitor, ever (visitor = signed cookie). */
  freeDownloadLimit: number;
  /** Soft cap on free downloads per IP address per day (0 = no cap). */
  freeIpDailyLimit: number;
};

export type DownloadContext =
  | {
      kind: "visitor";
      freeUsed: number;
      ipUsedToday: number;
      limits: FreeLimits;
    }
  | { kind: "customer"; plan: CustomerPlan };

export type DownloadDecision =
  | {
      allowed: true;
      watermark: boolean;
      charge: "free" | "plan";
      /** Downloads left after this one; null = unlimited */
      remaining: number | null;
    }
  | { allowed: false; reason: DenyReason };

export function planStatus(
  plan: Pick<CustomerPlan, "planExpiresAt">,
  now: Date
): PlanStatus {
  if (!plan.planExpiresAt) return "none";
  return plan.planExpiresAt.getTime() > now.getTime() ? "active" : "expired";
}

/** May this visitor or customer download one more flipbook right now? */
export function decideDownload(ctx: DownloadContext, now: Date): DownloadDecision {
  if (ctx.kind === "visitor") {
    const { freeDownloadLimit, freeIpDailyLimit } = ctx.limits;
    if (ctx.freeUsed >= freeDownloadLimit) return { allowed: false, reason: "free_limit" };
    if (freeIpDailyLimit > 0 && ctx.ipUsedToday >= freeIpDailyLimit) {
      return { allowed: false, reason: "ip_limit" };
    }
    return {
      allowed: true,
      watermark: true,
      charge: "free",
      remaining: freeDownloadLimit - ctx.freeUsed - 1,
    };
  }

  const plan = ctx.plan;
  if (plan.disabled) return { allowed: false, reason: "account_disabled" };
  const status = planStatus(plan, now);
  if (status === "none") return { allowed: false, reason: "no_plan" };
  if (status === "expired") return { allowed: false, reason: "plan_expired" };
  if (plan.downloadsAllowed !== null && plan.downloadsUsed >= plan.downloadsAllowed) {
    return { allowed: false, reason: "plan_limit" };
  }
  return {
    allowed: true,
    watermark: plan.watermark,
    charge: "plan",
    remaining:
      plan.downloadsAllowed === null ? null : plan.downloadsAllowed - plan.downloadsUsed - 1,
  };
}

/** Terms for a newly created flipbook: watermark and share-link lifetime. */
export function newFlipbookTerms(
  owner: { kind: "visitor" } | { kind: "customer"; plan: CustomerPlan },
  freeLinkHours: number,
  now: Date
): { watermarked: boolean; linkExpiresAt: Date } {
  if (owner.kind === "customer" && !owner.plan.disabled && planStatus(owner.plan, now) === "active") {
    return {
      watermarked: owner.plan.watermark,
      linkExpiresAt: new Date(now.getTime() + owner.plan.shareLinkDays * DAY),
    };
  }
  return { watermarked: true, linkExpiresAt: new Date(now.getTime() + freeLinkHours * HOUR) };
}

export function shareLinkStatus(
  flipbook: { disabled: boolean; filesDeleted: boolean; linkExpiresAt: Date },
  now: Date
): LinkStatus {
  if (flipbook.filesDeleted) return "deleted";
  if (flipbook.disabled) return "disabled";
  return flipbook.linkExpiresAt.getTime() > now.getTime() ? "active" : "expired";
}

export type InstantTokenState = { status: string; expiresAt: Date; usedAt: Date | null };

/** A one-time download link works once, before it expires. */
export function instantTokenStatus(
  token: InstantTokenState,
  now: Date
): "ok" | "used" | "expired" | "revoked" {
  if (token.usedAt || token.status === "used") return "used";
  if (token.status === "revoked") return "revoked";
  if (token.status === "expired" || token.expiresAt.getTime() <= now.getTime()) return "expired";
  return "ok";
}

/**
 * New expiry when a plan is approved or renewed. Time left on a plan that is
 * still running is kept, so renewing early never loses days.
 */
export function extendedExpiry(currentExpiry: Date | null, validityHours: number, now: Date): Date {
  const start =
    currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  return new Date(start.getTime() + validityHours * HOUR);
}
