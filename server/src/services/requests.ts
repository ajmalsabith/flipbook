import bcrypt from "bcryptjs";
import type { Customer, Request } from "@prisma/client";
import type { CustomerInfo, RequestKind, RequestStatusResponse } from "../../../shared/api";
import { whatsappLink } from "../../../shared/phone";
import { noValue, prisma, transaction } from "../db";
import { env } from "../env";
import { badRequest, conflict, notFound } from "../http/errors";
import { paymentProvider } from "../payments";
import { audit, type AuditActor } from "./audit";
import { BCRYPT_ROUNDS, claimVisitorFlipbooks, customerInfo, uniqueUsername } from "./customers";
import { extendedExpiry } from "./entitlement";
import { shareUrl } from "./flipbooks";
import { generatePassword, randomToken, requestCode } from "./ids";
import {
  instantMessage,
  loginMessage,
  rejectMessage,
  renewalMessage,
} from "./messages";
import { getSettings } from "./settings";
import { addHours, DAY_MS, HOUR_MS } from "./time";

export type CreateRequestInput = {
  planCode: string;
  name: string;
  whatsapp: string;
  email: string | null;
  flipbookId: string | null;
  customer: Customer | null;
  visitorId: string;
  ip: string;
};

async function uniqueCode(): Promise<string> {
  for (;;) {
    const code = requestCode();
    if (!(await prisma.request.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
}

/** A customer asks for a plan (or an instant download). Payment follows on WhatsApp. */
export async function createRequest(input: CreateRequestInput, now = new Date()): Promise<Request> {
  const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
  if (!plan || !plan.active) throw badRequest("This plan is not available.");

  let kind: RequestKind;
  let flipbookId: string | null = null;
  if (plan.type === "instant") {
    if (!input.flipbookId) throw badRequest("Choose the flipbook you want to download.");
    const fb = await prisma.flipbook.findUnique({ where: { id: input.flipbookId } });
    const owns =
      fb &&
      ((input.customer && fb.customerId === input.customer.id) ||
        (!fb.customerId && fb.visitorId === input.visitorId));
    if (!fb || !owns || fb.filesDeleted) throw notFound("That flipbook was not found.");
    flipbookId = fb.id;
    kind = "instant";
  } else {
    kind = input.customer ? "renewal" : "new";
  }

  // Pressing the button twice should not create two requests.
  const existing = await prisma.request.findFirst({
    where: {
      status: "pending",
      planId: plan.id,
      visitorId: input.visitorId,
      createdAt: { gte: new Date(now.getTime() - DAY_MS) },
      AND: [
        flipbookId ? { flipbookId } : noValue("flipbookId"),
        input.customer ? { customerId: input.customer.id } : noValue("customerId"),
      ],
    },
  });
  if (existing) {
    return prisma.request.update({
      where: { id: existing.id },
      data: { name: input.name, whatsapp: input.whatsapp, email: input.email },
    });
  }

  return prisma.request.create({
    data: {
      code: await uniqueCode(),
      kind,
      planId: plan.id,
      planName: plan.name,
      price: plan.price,
      name: input.name,
      whatsapp: input.whatsapp,
      email: input.email,
      customerId: input.customer?.id ?? null,
      flipbookId,
      paymentMethod: paymentProvider.id,
      visitorId: input.visitorId,
      ip: input.ip,
    },
  });
}

export async function requestStatus(code: string): Promise<RequestStatusResponse> {
  const req = await prisma.request.findUnique({
    where: { code: code.toUpperCase() },
    include: { flipbook: { select: { title: true } } },
  });
  if (!req) throw notFound("No request found with that reference code.");
  const settings = await getSettings();
  return {
    code: req.code,
    kind: req.kind as RequestKind,
    status: req.status as RequestStatusResponse["status"],
    planName: req.planName,
    price: req.price,
    firstName: req.name.trim().split(/\s+/)[0] ?? "",
    flipbookTitle: req.flipbook?.title ?? null,
    createdAt: req.createdAt.toISOString(),
    decidedAt: req.decidedAt?.toISOString() ?? null,
    rejectReason: req.status === "rejected" ? req.rejectReason : null,
    payment:
      req.status === "pending"
        ? paymentProvider.checkout(
            {
              kind: req.kind,
              code: req.code,
              planName: req.planName,
              price: req.price,
              name: req.name,
              flipbookTitle: req.flipbook?.title,
            },
            { adminWhatsapp: settings.whatsappNumber }
          )
        : null,
  };
}

export type FulfilInput = {
  planId: string;
  paymentRef?: string | null;
  note?: string | null;
  /** null = unlimited (ignored for instant requests) */
  downloadsAllowed: number | null;
  /** Plan length, or how long the one-time link works for instant requests */
  validityHours: number;
  /** Approve a "new" request onto an existing account instead of creating one. */
  attachCustomerId?: string | null;
};

export type FulfilResult = {
  kind: RequestKind;
  customer: CustomerInfo | null;
  /** Shown to the admin once, never stored in plain text. */
  credentials: { username: string; password: string } | null;
  instantLink: string | null;
  instantExpiresAt: string | null;
  message: string;
  whatsappUrl: string;
};

export function instantLinkUrl(token: string): string {
  return `${env.publicUrl}/d/${token}`;
}

/**
 * Marks a request as paid and gives the customer what they bought. Called by
 * the admin "Approve" button today; a payment-gateway webhook would call the
 * same function.
 */
export async function fulfilRequest(
  requestId: string,
  input: FulfilInput,
  actor: AuditActor,
  now = new Date()
): Promise<FulfilResult> {
  // Hash outside the transaction: it is slow on purpose.
  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Two admins approving at once: one transaction is aborted, retried, and
  // then sees the request is no longer pending.
  return transaction(async (tx) => {
    const req = await tx.request.findUnique({ where: { id: requestId }, include: { flipbook: true } });
    if (!req) throw notFound("Request not found.");
    if (req.status !== "pending") throw conflict(`This request is already ${req.status}.`);
    const plan = await tx.plan.findUnique({ where: { id: input.planId } });
    if (!plan) throw badRequest("Choose a plan.");

    const decided = {
      status: "approved",
      planId: plan.id,
      planName: plan.name,
      price: plan.id === req.planId ? req.price : plan.price,
      paymentRef: input.paymentRef || null,
      note: input.note || null,
      decidedAt: now,
      decidedById: actor.adminId,
    };

    if (req.kind === "instant") {
      if (plan.type !== "instant") throw badRequest("Choose an instant-download plan for this request.");
      const fb = req.flipbook;
      if (!fb || fb.filesDeleted) throw conflict("The flipbook for this request no longer exists.");
      const token = randomToken(24);
      const expiresAt = addHours(now, input.validityHours);
      await tx.instantToken.create({ data: { token, requestId: req.id, flipbookId: fb.id, expiresAt } });
      const linkExpiresAt = new Date(
        Math.max(fb.linkExpiresAt.getTime(), now.getTime() + plan.shareLinkDays * DAY_MS)
      );
      await tx.flipbook.update({
        where: { id: fb.id },
        data: { watermarked: false, linkExpiresAt, disabled: false },
      });
      await tx.request.update({ where: { id: req.id }, data: decided });
      const link = instantLinkUrl(token);
      const message = instantMessage({
        name: req.name,
        title: fb.title,
        link,
        expiresAt,
        shareUrl: shareUrl(fb.slug),
      });
      await audit(actor, "request.approve", { type: "request", id: req.code }, {
        kind: req.kind,
        plan: plan.name,
        paymentRef: input.paymentRef,
        flipbook: fb.id,
      }, tx);
      return {
        kind: "instant",
        customer: null,
        credentials: null,
        instantLink: link,
        instantExpiresAt: expiresAt.toISOString(),
        message,
        whatsappUrl: whatsappLink(req.whatsapp, message),
      } satisfies FulfilResult;
    }

    if (plan.type !== "subscription") throw badRequest("Choose a subscription plan for this request.");
    const terms = {
      planId: plan.id,
      planName: plan.name,
      planStatus: "active",
      downloadsAllowed: input.downloadsAllowed,
      downloadsUsed: 0,
      watermark: plan.watermark,
      shareLinkDays: plan.shareLinkDays,
      disabled: false,
    };

    const existingId = req.customerId ?? input.attachCustomerId ?? null;
    let customer: Customer;
    let credentials: FulfilResult["credentials"] = null;
    let message: string;
    if (existingId) {
      const current = await tx.customer.findUnique({ where: { id: existingId } });
      if (!current) throw notFound("Customer not found.");
      const running = current.planExpiresAt && current.planExpiresAt > now;
      customer = await tx.customer.update({
        where: { id: current.id },
        data: {
          ...terms,
          planStartsAt: running ? current.planStartsAt ?? now : now,
          planExpiresAt: extendedExpiry(current.planExpiresAt, input.validityHours, now),
        },
      });
      message = renewalMessage({
        name: customer.name,
        username: customer.username,
        planName: plan.name,
        expiresAt: customer.planExpiresAt!,
        downloadsAllowed: customer.downloadsAllowed,
      });
    } else {
      const username = await uniqueUsername(tx, req.name);
      customer = await tx.customer.create({
        data: {
          ...terms,
          username,
          passwordHash,
          name: req.name,
          whatsapp: req.whatsapp,
          email: req.email,
          planStartsAt: now,
          planExpiresAt: new Date(now.getTime() + input.validityHours * HOUR_MS),
        },
      });
      credentials = { username, password };
      message = loginMessage({
        name: customer.name,
        username,
        password,
        planName: plan.name,
        expiresAt: customer.planExpiresAt!,
        downloadsAllowed: customer.downloadsAllowed,
      });
    }
    if (req.visitorId) await claimVisitorFlipbooks(tx, req.visitorId, customer, now);
    await tx.request.update({ where: { id: req.id }, data: { ...decided, customerId: customer.id } });
    await audit(actor, "request.approve", { type: "request", id: req.code }, {
      kind: req.kind,
      plan: plan.name,
      paymentRef: input.paymentRef,
      customer: customer.username,
      newAccount: !!credentials,
      expiresAt: customer.planExpiresAt,
      downloadsAllowed: customer.downloadsAllowed,
    }, tx);
    return {
      kind: req.kind as RequestKind,
      customer: customerInfo({ ...customer, plan }, now),
      credentials,
      instantLink: null,
      instantExpiresAt: null,
      message,
      whatsappUrl: whatsappLink(customer.whatsapp, message),
    } satisfies FulfilResult;
  });
}

export async function rejectRequest(
  requestId: string,
  reason: string,
  actor: AuditActor,
  now = new Date()
): Promise<{ whatsappUrl: string; message: string }> {
  const req = await prisma.request.findUnique({ where: { id: requestId } });
  if (!req) throw notFound("Request not found.");
  if (req.status !== "pending") throw conflict(`This request is already ${req.status}.`);
  await prisma.request.update({
    where: { id: req.id },
    data: { status: "rejected", rejectReason: reason, decidedAt: now, decidedById: actor.adminId },
  });
  await audit(actor, "request.reject", { type: "request", id: req.code }, { reason });
  const message = rejectMessage({ name: req.name, code: req.code, reason });
  return { message, whatsappUrl: whatsappLink(req.whatsapp, message) };
}

/** New one-time link for an approved instant request (the old ones stop working). */
export async function reissueInstantLink(
  requestId: string,
  validityHours: number,
  actor: AuditActor,
  now = new Date()
) {
  return transaction(async (tx) => {
    const req = await tx.request.findUnique({ where: { id: requestId }, include: { flipbook: true } });
    if (!req || req.kind !== "instant") throw notFound("Instant request not found.");
    if (req.status !== "approved") throw conflict("Approve the request first.");
    if (!req.flipbook || req.flipbook.filesDeleted) throw conflict("The flipbook no longer exists.");
    await tx.instantToken.updateMany({
      where: { requestId, status: "active" },
      data: { status: "revoked" },
    });
    const token = randomToken(24);
    const expiresAt = addHours(now, validityHours);
    await tx.instantToken.create({
      data: { token, requestId, flipbookId: req.flipbook.id, expiresAt },
    });
    await audit(actor, "request.reissue_link", { type: "request", id: req.code }, { validityHours }, tx);
    const link = instantLinkUrl(token);
    const message = instantMessage({
      name: req.name,
      title: req.flipbook.title,
      link,
      expiresAt,
      shareUrl: shareUrl(req.flipbook.slug),
    });
    return {
      instantLink: link,
      instantExpiresAt: expiresAt.toISOString(),
      message,
      whatsappUrl: whatsappLink(req.whatsapp, message),
    };
  });
}
