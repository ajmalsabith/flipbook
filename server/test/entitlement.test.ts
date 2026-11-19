import { describe, expect, it } from "vitest";
import {
  decideDownload,
  extendedExpiry,
  instantTokenStatus,
  newFlipbookTerms,
  planStatus,
  shareLinkStatus,
  type CustomerPlan,
} from "../src/services/entitlement";

const now = new Date("2026-11-19T10:00:00Z");
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);
const limits = { freeDownloadLimit: 5, freeIpDailyLimit: 20 };

function plan(overrides: Partial<CustomerPlan> = {}): CustomerPlan {
  return {
    planExpiresAt: hours(24),
    downloadsAllowed: 5,
    downloadsUsed: 0,
    watermark: false,
    shareLinkDays: 7,
    disabled: false,
    ...overrides,
  };
}

describe("free downloads (no login)", () => {
  it("allows 5 watermarked downloads per visitor", () => {
    for (let used = 0; used < 5; used++) {
      const d = decideDownload({ kind: "visitor", freeUsed: used, ipUsedToday: used, limits }, now);
      expect(d).toEqual({ allowed: true, watermark: true, charge: "free", remaining: 4 - used });
    }
  });

  it("refuses the 6th download with free_limit", () => {
    const d = decideDownload({ kind: "visitor", freeUsed: 5, ipUsedToday: 5, limits }, now);
    expect(d).toEqual({ allowed: false, reason: "free_limit" });
  });

  it("applies the per-IP daily cap as a soft limit", () => {
    const d = decideDownload({ kind: "visitor", freeUsed: 0, ipUsedToday: 20, limits }, now);
    expect(d).toEqual({ allowed: false, reason: "ip_limit" });
  });

  it("an IP cap of 0 means no cap", () => {
    const d = decideDownload(
      { kind: "visitor", freeUsed: 0, ipUsedToday: 500, limits: { ...limits, freeIpDailyLimit: 0 } },
      now
    );
    expect(d.allowed).toBe(true);
  });
});

describe("1-Day Pass (5 downloads)", () => {
  it("allows clean downloads until the allowance is used", () => {
    const d = decideDownload({ kind: "customer", plan: plan({ downloadsUsed: 4 }) }, now);
    expect(d).toEqual({ allowed: true, watermark: false, charge: "plan", remaining: 0 });
  });

  it("refuses the 6th download with plan_limit", () => {
    const d = decideDownload({ kind: "customer", plan: plan({ downloadsUsed: 5 }) }, now);
    expect(d).toEqual({ allowed: false, reason: "plan_limit" });
  });
});

describe("unlimited plans", () => {
  it("never runs out while active", () => {
    const d = decideDownload(
      { kind: "customer", plan: plan({ downloadsAllowed: null, downloadsUsed: 10_000 }) },
      now
    );
    expect(d).toEqual({ allowed: true, watermark: false, charge: "plan", remaining: null });
  });

  it("uses the plan's watermark setting", () => {
    const d = decideDownload({ kind: "customer", plan: plan({ watermark: true }) }, now);
    expect(d.allowed && d.watermark).toBe(true);
  });
});

describe("plan expiry", () => {
  it("refuses downloads once the plan has expired, even with downloads left", () => {
    const d = decideDownload(
      { kind: "customer", plan: plan({ planExpiresAt: hours(-1), downloadsAllowed: null }) },
      now
    );
    expect(d).toEqual({ allowed: false, reason: "plan_expired" });
  });

  it("treats the exact expiry moment as expired", () => {
    expect(planStatus({ planExpiresAt: now }, now)).toBe("expired");
    expect(planStatus({ planExpiresAt: hours(1) }, now)).toBe("active");
    expect(planStatus({ planExpiresAt: null }, now)).toBe("none");
  });

  it("refuses customers without a plan and disabled accounts", () => {
    expect(decideDownload({ kind: "customer", plan: plan({ planExpiresAt: null }) }, now)).toEqual({
      allowed: false,
      reason: "no_plan",
    });
    expect(decideDownload({ kind: "customer", plan: plan({ disabled: true }) }, now)).toEqual({
      allowed: false,
      reason: "account_disabled",
    });
  });

  it("renewing early keeps the time left; renewing late starts now", () => {
    expect(extendedExpiry(hours(10), 24, now)).toEqual(hours(34));
    expect(extendedExpiry(hours(-10), 24, now)).toEqual(hours(24));
    expect(extendedExpiry(null, 168, now)).toEqual(hours(168));
  });
});

describe("instant download links", () => {
  const token = { status: "active", expiresAt: hours(48), usedAt: null };

  it("works once before it expires", () => {
    expect(instantTokenStatus(token, now)).toBe("ok");
  });

  it("is refused after it has been used", () => {
    expect(instantTokenStatus({ ...token, usedAt: hours(1), status: "used" }, hours(2))).toBe("used");
  });

  it("is refused after 48 hours", () => {
    expect(instantTokenStatus(token, hours(48))).toBe("expired");
    expect(instantTokenStatus({ ...token, status: "expired" }, now)).toBe("expired");
  });

  it("is refused when revoked", () => {
    expect(instantTokenStatus({ ...token, status: "revoked" }, now)).toBe("revoked");
  });
});

describe("share links", () => {
  it("free flipbooks are watermarked and their link lasts the free hours", () => {
    expect(newFlipbookTerms({ kind: "visitor" }, 24, now)).toEqual({
      watermarked: true,
      linkExpiresAt: hours(24),
    });
  });

  it("active customers get the plan's link lifetime without watermark", () => {
    expect(newFlipbookTerms({ kind: "customer", plan: plan({ shareLinkDays: 30 }) }, 24, now)).toEqual({
      watermarked: false,
      linkExpiresAt: hours(30 * 24),
    });
  });

  it("expired customers create on free terms", () => {
    expect(
      newFlipbookTerms({ kind: "customer", plan: plan({ planExpiresAt: hours(-1) }) }, 24, now)
    ).toEqual({ watermarked: true, linkExpiresAt: hours(24) });
  });

  it("expires at the expiry time, and can be disabled or deleted", () => {
    const fb = { disabled: false, filesDeleted: false, linkExpiresAt: hours(1) };
    expect(shareLinkStatus(fb, now)).toBe("active");
    expect(shareLinkStatus(fb, hours(1))).toBe("expired");
    expect(shareLinkStatus({ ...fb, disabled: true }, now)).toBe("disabled");
    expect(shareLinkStatus({ ...fb, filesDeleted: true }, now)).toBe("deleted");
  });
});
