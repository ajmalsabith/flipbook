import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Customer, Plan, Prisma, Request as DbRequest } from "@prisma/client";
import type {
  AdminCustomerDetail,
  AdminCustomerRow,
  AdminFlipbookRow,
  AdminPlan,
  AdminRequestDetail,
  AdminRequestRow,
  AdminStats,
  AuditRow,
  Paged,
} from "../../../shared/adminApi";
import type { RequestKind, RequestStatus } from "../../../shared/api";
import { normalizeWhatsapp, whatsappLink } from "../../../shared/phone";
import { hasValue, isObjectId, noValue, prisma } from "../db";
import {
  adminActor,
  clientIp,
  endAdminSession,
  requireAdmin,
  startAdminSession,
} from "../http/auth";
import { badRequest, notFound, unauthorized } from "../http/errors";
import { limits } from "../http/security";
import { audit } from "../services/audit";
import { BCRYPT_ROUNDS, customerInfo } from "../services/customers";
import { extendedExpiry, planStatus } from "../services/entitlement";
import { deleteFlipbook, toSummary } from "../services/flipbooks";
import { generatePassword } from "../services/ids";
import { resetPasswordMessage } from "../services/messages";
import {
  fulfilRequest,
  instantLinkUrl,
  reissueInstantLink,
  rejectRequest,
} from "../services/requests";
import { getSettings, saveSettings, settingsSchema } from "../services/settings";
import { startOfDayIST, startOfMonthIST } from "../services/time";

export const adminRouter = Router();

const PAGE_SIZE = 25;

function pageOf(query: unknown): number {
  const page = Number((query as { page?: string }).page ?? 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The :id route parameter as a database id; anything else is a 404. */
function idParam(req: Request, what: string): string {
  const id = req.params.id;
  if (!isObjectId(id)) throw notFound(`${what} not found.`);
  return id;
}

const objectId = z.string().refine(isObjectId, "Invalid id.");

/** Case-insensitive "contains" (SQLite's LIKE was; MongoDB's is not). */
function like(q: string) {
  return { contains: q, mode: "insensitive" as const };
}

function toPlan(p: Plan): AdminPlan {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    tagline: p.tagline,
    type: p.type as AdminPlan["type"],
    price: p.price,
    downloadLimit: p.downloadLimit,
    validityHours: p.validityHours,
    shareLinkDays: p.shareLinkDays,
    watermark: p.watermark,
    highlight: p.highlight,
    active: p.active,
    sortOrder: p.sortOrder,
  };
}

function toRequestRow(r: DbRequest): AdminRequestRow {
  return {
    id: r.id,
    code: r.code,
    kind: r.kind as RequestKind,
    status: r.status as RequestStatus,
    planName: r.planName,
    price: r.price,
    name: r.name,
    whatsapp: r.whatsapp,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
  };
}

function toCustomerRow(c: Customer & { plan: Plan | null; _count?: { flipbooks: number } }): AdminCustomerRow {
  return {
    ...customerInfo(c),
    disabled: c.disabled,
    createdAt: c.createdAt.toISOString(),
    lastLoginAt: c.lastLoginAt?.toISOString() ?? null,
    flipbookCount: c._count?.flipbooks ?? 0,
  };
}

// ---- Session -----------------------------------------------------------------

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

adminRouter.post("/login", limits.adminLogin, async (req, res) => {
  const { username, password } = z
    .object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) })
    .parse(req.body);
  const admin = await prisma.admin.findUnique({ where: { username } });
  const ok = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !ok) throw unauthorized("Wrong username or password.");
  await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  startAdminSession(res, admin);
  await audit({ adminId: admin.id, name: admin.username, ip: clientIp(req) }, "admin.login");
  res.json({ username: admin.username });
});

adminRouter.post("/logout", (_req, res) => {
  endAdminSession(res);
  res.json({ ok: true });
});

adminRouter.use(requireAdmin);

adminRouter.get("/me", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ username: req.admin!.username });
});

adminRouter.post("/password", async (req, res) => {
  const { current, next } = z
    .object({
      current: z.string().min(1, "Enter your current password."),
      next: z.string().min(10, "Use at least 10 characters.").max(200),
    })
    .parse(req.body);
  const admin = req.admin!;
  if (!(await bcrypt.compare(current, admin.passwordHash))) {
    throw badRequest("Your current password is not correct.", { current: "Not correct." });
  }
  const updated = await prisma.admin.update({
    where: { id: admin.id },
    data: { passwordHash: await bcrypt.hash(next, BCRYPT_ROUNDS), tokenVersion: { increment: 1 } },
  });
  startAdminSession(res, updated);
  await audit(adminActor(req), "admin.change_password");
  res.json({ ok: true });
});

// ---- Dashboard -----------------------------------------------------------------

adminRouter.get("/stats", async (_req, res) => {
  const now = new Date();
  const today = startOfDayIST(now);
  const month = startOfMonthIST(now);
  const [pendingRequests, activeCustomers, downloadsToday, flipbooksCreated, flipbooksToday, revenue, recent] =
    await Promise.all([
      prisma.request.count({ where: { status: "pending" } }),
      prisma.customer.count({ where: { disabled: false, planExpiresAt: { gt: now } } }),
      prisma.downloadEvent.count({ where: { createdAt: { gte: today } } }),
      prisma.flipbook.count(),
      prisma.flipbook.count({ where: { createdAt: { gte: today } } }),
      prisma.request.aggregate({
        where: { status: "approved", decidedAt: { gte: month } },
        _sum: { price: true },
        _count: true,
      }),
      prisma.request.findMany({ where: { status: "pending" }, orderBy: { createdAt: "desc" }, take: 6 }),
    ]);
  const stats: AdminStats = {
    pendingRequests,
    activeCustomers,
    downloadsToday,
    flipbooksCreated,
    flipbooksToday,
    revenueThisMonth: revenue._sum.price ?? 0,
    approvedThisMonth: revenue._count,
    recentPending: recent.map(toRequestRow),
  };
  res.json(stats);
});

// ---- Requests ------------------------------------------------------------------

adminRouter.get("/requests", async (req, res) => {
  const page = pageOf(req.query);
  const status = str(req.query.status);
  const kind = str(req.query.kind);
  const q = str(req.query.q);
  const where: Prisma.RequestWhereInput = {
    ...(["pending", "approved", "rejected"].includes(status) ? { status } : {}),
    ...(["new", "renewal", "instant"].includes(kind) ? { kind } : {}),
    ...(q
      ? {
          OR: [
            { code: like(q) },
            { name: like(q) },
            { whatsapp: { contains: q.replace(/\D/g, "") || q } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.request.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.request.count({ where }),
  ]);
  const body: Paged<AdminRequestRow> = { items: items.map(toRequestRow), total, page, pageSize: PAGE_SIZE };
  res.json(body);
});

adminRouter.get("/requests/:id", async (req, res) => {
  const r = await prisma.request.findUnique({
    where: { id: idParam(req, "Request") },
    include: {
      customer: { include: { plan: true } },
      flipbook: true,
      decidedBy: { select: { username: true } },
      instantTokens: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!r) throw notFound("Request not found.");
  const matching =
    r.kind === "new"
      ? await prisma.customer.findMany({ where: { whatsapp: r.whatsapp }, include: { plan: true }, take: 5 })
      : [];
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  const now = new Date();
  const detail: AdminRequestDetail = {
    request: {
      ...toRequestRow(r),
      planId: r.planId,
      email: r.email,
      paymentMethod: r.paymentMethod,
      paymentRef: r.paymentRef,
      note: r.note,
      rejectReason: r.rejectReason,
      decidedBy: r.decidedBy?.username ?? null,
      ip: r.ip,
    },
    customer: r.customer ? customerInfo(r.customer, now) : null,
    matchingCustomers: matching.map((c) => customerInfo(c, now)),
    flipbook: r.flipbook ? toSummary(r.flipbook, now) : null,
    instantTokens: r.instantTokens.map((t) => ({
      id: t.id,
      status: t.status === "active" && t.expiresAt <= now ? "expired" : t.status,
      expiresAt: t.expiresAt.toISOString(),
      usedAt: t.usedAt?.toISOString() ?? null,
      link: t.status === "active" && t.expiresAt > now ? instantLinkUrl(t.token) : null,
    })),
    plans: plans.map(toPlan),
    chatUrl: whatsappLink(r.whatsapp, ""),
  };
  res.json(detail);
});

const approveSchema = z.object({
  planId: objectId,
  paymentRef: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  downloadsAllowed: z.number().int().min(1).max(100000).nullable(),
  validityHours: z.number().int().min(1).max(24 * 3650),
  attachCustomerId: objectId.optional().nullable(),
});

adminRouter.post("/requests/:id/approve", async (req, res) => {
  const id = idParam(req, "Request");
  const input = approveSchema.parse(req.body);
  res.json(await fulfilRequest(id, input, adminActor(req)));
});

adminRouter.post("/requests/:id/reject", async (req, res) => {
  const id = idParam(req, "Request");
  const { reason } = z
    .object({ reason: z.string().trim().min(3, "Enter a reason.").max(300) })
    .parse(req.body);
  res.json(await rejectRequest(id, reason, adminActor(req)));
});

adminRouter.post("/requests/:id/reissue", async (req, res) => {
  const id = idParam(req, "Request");
  const { validityHours } = z
    .object({ validityHours: z.number().int().min(1).max(24 * 30) })
    .parse(req.body);
  res.json(await reissueInstantLink(id, validityHours, adminActor(req)));
});

// ---- Customers -----------------------------------------------------------------

adminRouter.get("/customers", async (req, res) => {
  const page = pageOf(req.query);
  const q = str(req.query.q);
  const status = str(req.query.status);
  const now = new Date();
  const where: Prisma.CustomerWhereInput = {
    AND: [
      status === "active" ? { disabled: false, planExpiresAt: { gt: now } } : {},
      status === "expired" ? { AND: [hasValue("planExpiresAt"), { planExpiresAt: { lte: now } }] } : {},
      status === "disabled" ? { disabled: true } : {},
      q
        ? {
            OR: [
              { username: like(q) },
              { name: like(q) },
              { whatsapp: { contains: q.replace(/\D/g, "") || q } },
              { email: like(q) },
            ],
          }
        : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { plan: true, _count: { select: { flipbooks: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.customer.count({ where }),
  ]);
  const body: Paged<AdminCustomerRow> = { items: items.map(toCustomerRow), total, page, pageSize: PAGE_SIZE };
  res.json(body);
});

async function customerDetail(id: string): Promise<AdminCustomerDetail> {
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      plan: true,
      _count: { select: { flipbooks: true } },
      flipbooks: { orderBy: { createdAt: "desc" }, take: 100 },
      requests: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!c) throw notFound("Customer not found.");
  const now = new Date();
  return {
    customer: toCustomerRow(c),
    flipbooks: c.flipbooks.map((f) => toSummary(f, now)),
    requests: c.requests.map(toRequestRow),
    chatUrl: whatsappLink(c.whatsapp, ""),
  };
}

adminRouter.get("/customers/:id", async (req, res) => {
  res.json(await customerDetail(idParam(req, "Customer")));
});

const customerPatch = z
  .object({
    name: z.string().trim().min(2).max(80),
    whatsapp: z.string().trim().max(30),
    email: z.string().trim().max(120).email().or(z.literal("")).nullable(),
    planExpiresAt: z.string().datetime({ offset: true }).nullable(),
    downloadsAllowed: z.number().int().min(0).max(100000).nullable(),
    downloadsUsed: z.number().int().min(0).max(100000),
    watermark: z.boolean(),
    shareLinkDays: z.number().int().min(1).max(3650),
    disabled: z.boolean(),
  })
  .partial()
  .strict();

adminRouter.patch("/customers/:id", async (req, res) => {
  const id = idParam(req, "Customer");
  const body = customerPatch.parse(req.body);
  const current = await prisma.customer.findUnique({ where: { id } });
  if (!current) throw notFound("Customer not found.");
  const data: Prisma.CustomerUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.whatsapp !== undefined) {
    const n = normalizeWhatsapp(body.whatsapp);
    if (!n) throw badRequest("Enter a valid WhatsApp number.", { whatsapp: "Invalid number." });
    data.whatsapp = n;
  }
  if (body.email !== undefined) data.email = body.email || null;
  if (body.planExpiresAt !== undefined) {
    const expires = body.planExpiresAt ? new Date(body.planExpiresAt) : null;
    data.planExpiresAt = expires;
    data.planStatus = planStatus({ planExpiresAt: expires }, new Date());
  }
  if (body.downloadsAllowed !== undefined) data.downloadsAllowed = body.downloadsAllowed;
  if (body.downloadsUsed !== undefined) data.downloadsUsed = body.downloadsUsed;
  if (body.watermark !== undefined) data.watermark = body.watermark;
  if (body.shareLinkDays !== undefined) data.shareLinkDays = body.shareLinkDays;
  if (body.disabled !== undefined) {
    data.disabled = body.disabled;
    // Disabling signs the customer out everywhere.
    if (body.disabled && !current.disabled) data.tokenVersion = { increment: 1 };
  }
  await prisma.customer.update({ where: { id }, data });
  await audit(adminActor(req), "customer.update", { type: "customer", id: current.username }, body);
  res.json(await customerDetail(id));
});

adminRouter.post("/customers/:id/extend", async (req, res) => {
  const id = idParam(req, "Customer");
  const { hours } = z.object({ hours: z.number().int().min(1).max(24 * 3650) }).parse(req.body);
  const current = await prisma.customer.findUnique({ where: { id } });
  if (!current) throw notFound("Customer not found.");
  const now = new Date();
  const planExpiresAt = extendedExpiry(current.planExpiresAt, hours, now);
  await prisma.customer.update({ where: { id }, data: { planExpiresAt, planStatus: "active" } });
  await audit(adminActor(req), "customer.extend", { type: "customer", id: current.username }, {
    hours,
    planExpiresAt,
  });
  res.json(await customerDetail(id));
});

adminRouter.post("/customers/:id/reset-password", async (req, res) => {
  const id = idParam(req, "Customer");
  const current = await prisma.customer.findUnique({ where: { id } });
  if (!current) throw notFound("Customer not found.");
  const password = generatePassword();
  await prisma.customer.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), tokenVersion: { increment: 1 } },
  });
  await audit(adminActor(req), "customer.reset_password", { type: "customer", id: current.username });
  const message = resetPasswordMessage({ name: current.name, username: current.username, password });
  res.json({
    username: current.username,
    password,
    message,
    whatsappUrl: whatsappLink(current.whatsapp, message),
  });
});

// ---- Plans -----------------------------------------------------------------------

adminRouter.get("/plans", async (_req, res) => {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  res.json(plans.map(toPlan));
});

const planPatch = z
  .object({
    name: z.string().trim().min(2).max(60),
    tagline: z.string().trim().max(120),
    price: z.number().int().min(0).max(1_000_000),
    downloadLimit: z.number().int().min(1).max(100000).nullable(),
    validityHours: z.number().int().min(1).max(24 * 3650),
    shareLinkDays: z.number().int().min(1).max(3650),
    watermark: z.boolean(),
    highlight: z.boolean(),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(1000),
  })
  .partial()
  .strict();

adminRouter.patch("/plans/:id", async (req, res) => {
  const id = idParam(req, "Plan");
  const body = planPatch.parse(req.body);
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) throw notFound("Plan not found.");
  const updated = await prisma.plan.update({ where: { id }, data: body });
  await audit(adminActor(req), "plan.update", { type: "plan", id: plan.code }, body);
  res.json(toPlan(updated));
});

// ---- Flipbooks ---------------------------------------------------------------------

adminRouter.get("/flipbooks", async (req, res) => {
  const page = pageOf(req.query);
  const q = str(req.query.q);
  const status = str(req.query.status);
  const owner = str(req.query.owner);
  const now = new Date();
  const where: Prisma.FlipbookWhereInput = {
    AND: [
      status === "active" ? { disabled: false, filesDeleted: false, linkExpiresAt: { gt: now } } : {},
      status === "expired" ? { filesDeleted: false, linkExpiresAt: { lte: now } } : {},
      status === "disabled" ? { disabled: true } : {},
      status === "deleted" ? { filesDeleted: true } : {},
      owner === "anonymous" ? noValue("customerId") : {},
      owner === "customer" ? hasValue("customerId") : {},
      q
        ? {
            OR: [
              { title: like(q) },
              { slug: like(q) },
              { customer: { is: { username: like(q) } } },
            ],
          }
        : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.flipbook.findMany({
      where,
      include: { customer: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.flipbook.count({ where }),
  ]);
  const body: Paged<AdminFlipbookRow> = {
    items: items.map((f) => ({
      ...toSummary(f, now),
      filesDeleted: f.filesDeleted,
      owner: f.customer
        ? { type: "customer", id: f.customer.id, username: f.customer.username }
        : { type: "anonymous" },
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
  res.json(body);
});

const flipbookPatch = z
  .object({
    title: z.string().trim().min(1).max(120),
    disabled: z.boolean(),
    linkExpiresAt: z.string().datetime({ offset: true }),
    watermarked: z.boolean(),
  })
  .partial()
  .strict();

adminRouter.patch("/flipbooks/:id", async (req, res) => {
  const body = flipbookPatch.parse(req.body);
  const fb = await prisma.flipbook.findUnique({ where: { id: req.params.id } });
  if (!fb) throw notFound("Flipbook not found.");
  const updated = await prisma.flipbook.update({
    where: { id: fb.id },
    data: { ...body, ...(body.linkExpiresAt ? { linkExpiresAt: new Date(body.linkExpiresAt) } : {}) },
  });
  await audit(adminActor(req), "flipbook.update", { type: "flipbook", id: fb.slug }, body);
  res.json(toSummary(updated));
});

adminRouter.delete("/flipbooks/:id", async (req, res) => {
  const fb = await prisma.flipbook.findUnique({ where: { id: req.params.id } });
  if (!fb) throw notFound("Flipbook not found.");
  await deleteFlipbook(fb.id);
  await audit(adminActor(req), "flipbook.delete", { type: "flipbook", id: fb.slug }, { title: fb.title });
  res.json({ ok: true });
});

// ---- Settings and audit log -----------------------------------------------------------

adminRouter.get("/settings", async (_req, res) => {
  res.json(await getSettings());
});

adminRouter.put("/settings", async (req, res) => {
  const values = settingsSchema.partial().strict().parse(req.body);
  const saved = await saveSettings(values);
  await audit(adminActor(req), "settings.update", null, values);
  res.json(saved);
});

adminRouter.get("/audit", async (req, res) => {
  const page = pageOf(req.query);
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.auditLog.count(),
  ]);
  const body: Paged<AuditRow> = {
    items: items.map((a) => ({
      id: a.id,
      actor: a.actor,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      details: a.details,
      ip: a.ip,
      createdAt: a.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
  res.json(body);
});
