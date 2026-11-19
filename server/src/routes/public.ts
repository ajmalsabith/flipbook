import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { MeResponse, PublicConfig, PublicPlan } from "../../../shared/api";
import { brandName } from "../../../shared/theme";
import { prisma } from "../db";
import { env } from "../env";
import {
  clientIp,
  endCustomerSession,
  requireCustomer,
  startCustomerSession,
} from "../http/auth";
import { badRequest, HttpError, unauthorized } from "../http/errors";
import { limits } from "../http/security";
import { BCRYPT_ROUNDS, claimVisitorFlipbooks, customerInfo } from "../services/customers";
import { downloadSummary, type DownloadActor } from "../services/downloads";
import { getSettings } from "../services/settings";

export const publicRouter = Router();

export function toPublicPlan(p: {
  id: number;
  code: string;
  name: string;
  tagline: string;
  type: string;
  price: number;
  downloadLimit: number | null;
  validityHours: number;
  shareLinkDays: number;
  watermark: boolean;
  highlight: boolean;
}): PublicPlan {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    tagline: p.tagline,
    type: p.type as PublicPlan["type"],
    price: p.price,
    downloadLimit: p.downloadLimit,
    validityHours: p.validityHours,
    shareLinkDays: p.shareLinkDays,
    watermark: p.watermark,
    highlight: p.highlight,
  };
}

publicRouter.get("/config", async (_req, res) => {
  const s = await getSettings();
  const config: PublicConfig = {
    brandName,
    publicUrl: env.publicUrl,
    whatsappNumber: s.whatsappNumber,
    freeDownloadLimit: s.freeDownloadLimit,
    freeLinkHours: s.freeLinkHours,
    maxPdfMb: s.maxPdfMb,
    maxPages: s.maxPages,
    watermarkText: s.watermarkText,
  };
  res.json(config);
});

publicRouter.get("/plans", async (_req, res) => {
  const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  res.json(plans.map(toPublicPlan));
});

export function downloadActor(req: Request): DownloadActor {
  const ip = clientIp(req);
  return req.customer
    ? { kind: "customer", customerId: req.customer.id, ip }
    : { kind: "visitor", visitorId: req.visitorId, ip };
}

publicRouter.get("/me", async (req, res) => {
  const customer = req.customer
    ? await prisma.customer.findUnique({ where: { id: req.customer.id }, include: { plan: true } })
    : null;
  const summary = await downloadSummary(downloadActor(req));
  const me: MeResponse = { customer: customer ? customerInfo(customer) : null, ...summary };
  res.setHeader("Cache-Control", "no-store");
  res.json(me);
});

// ---- Customer login --------------------------------------------------------

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Enter your username.").max(60),
  password: z.string().min(1, "Enter your password.").max(200),
});

// Compared against when the username does not exist, so both cases take
// the same time.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

publicRouter.post("/auth/login", limits.login, async (req, res) => {
  const { username, password } = loginSchema.parse(req.body);
  const customer = await prisma.customer.findUnique({ where: { username } });
  const ok = await bcrypt.compare(password, customer?.passwordHash ?? DUMMY_HASH);
  if (!customer || !ok) throw unauthorized("Wrong username or password.");
  if (customer.disabled) {
    throw new HttpError(403, "account_disabled", "This account is disabled. Please contact us on WhatsApp.");
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({ where: { id: customer.id }, data: { lastLoginAt: now } });
    await claimVisitorFlipbooks(tx, req.visitorId, customer, now);
  });
  startCustomerSession(res, customer);
  const fresh = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id }, include: { plan: true } });
  res.json({ customer: customerInfo(fresh, now) });
});

publicRouter.post("/auth/logout", (_req, res) => {
  endCustomerSession(res);
  res.json({ ok: true });
});

const passwordSchema = z.object({
  current: z.string().min(1, "Enter your current password."),
  next: z.string().min(10, "Use at least 10 characters.").max(200),
});

publicRouter.post("/auth/password", requireCustomer, async (req, res) => {
  const { current, next } = passwordSchema.parse(req.body);
  const customer = req.customer!;
  if (!(await bcrypt.compare(current, customer.passwordHash))) {
    throw badRequest("Your current password is not correct.", { current: "Not correct." });
  }
  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: {
      passwordHash: await bcrypt.hash(next, BCRYPT_ROUNDS),
      tokenVersion: { increment: 1 },
    },
  });
  startCustomerSession(res, updated);
  res.json({ ok: true });
});
