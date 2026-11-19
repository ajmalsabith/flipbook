import type { CookieOptions, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import type { Admin, Customer } from "@prisma/client";
import { isObjectId, prisma } from "../db";
import { env } from "../env";
import { randomToken } from "../services/ids";
import { unauthorized } from "./errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      visitorId: string;
      customer: Customer | null;
      admin: Admin | null;
    }
  }
}

export const CUSTOMER_COOKIE = "amf_session";
export const ADMIN_COOKIE = "amf_admin";
export const VISITOR_COOKIE = "amf_vid";

const CUSTOMER_TTL_DAYS = 30;
const ADMIN_TTL_HOURS = 12;

function cookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.publicUrl.startsWith("https://"),
    path: "/",
    maxAge: maxAgeMs,
  };
}

type SessionClaims = { typ: "customer" | "admin"; v: number; sub: string };

function sign(typ: SessionClaims["typ"], id: string, version: number, ttlSeconds: number): string {
  return jwt.sign({ typ, v: version }, env.jwtSecret, {
    subject: id,
    expiresIn: ttlSeconds,
    algorithm: "HS256",
  });
}

function verify(token: string | undefined, typ: SessionClaims["typ"]): SessionClaims | null {
  if (!token) return null;
  try {
    const claims = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] }) as SessionClaims;
    return claims.typ === typ ? claims : null;
  } catch {
    return null;
  }
}

export function startCustomerSession(res: Response, customer: Customer): void {
  const ttl = CUSTOMER_TTL_DAYS * 86400;
  res.cookie(CUSTOMER_COOKIE, sign("customer", customer.id, customer.tokenVersion, ttl), cookieOptions(ttl * 1000));
}

export function endCustomerSession(res: Response): void {
  res.clearCookie(CUSTOMER_COOKIE, { ...cookieOptions(0), maxAge: undefined });
}

export function startAdminSession(res: Response, admin: Admin): void {
  const ttl = ADMIN_TTL_HOURS * 3600;
  res.cookie(ADMIN_COOKIE, sign("admin", admin.id, admin.tokenVersion, ttl), cookieOptions(ttl * 1000));
}

export function endAdminSession(res: Response): void {
  res.clearCookie(ADMIN_COOKIE, { ...cookieOptions(0), maxAge: undefined });
}

/**
 * Every browser gets a random id in a signed, httpOnly cookie. Free downloads
 * and anonymous flipbooks belong to it.
 */
export const visitor: RequestHandler = (req, res, next) => {
  const signed = req.signedCookies?.[VISITOR_COOKIE];
  if (typeof signed === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(signed)) {
    req.visitorId = signed;
  } else {
    req.visitorId = randomToken(18);
    res.cookie(VISITOR_COOKIE, req.visitorId, { ...cookieOptions(365 * 86400 * 1000), signed: true });
  }
  next();
};

/** Loads the logged-in customer and admin (if any) from their cookies. */
export const session: RequestHandler = async (req, res, next) => {
  req.customer = null;
  req.admin = null;
  const customerClaims = verify(req.cookies?.[CUSTOMER_COOKIE], "customer");
  if (customerClaims) {
    const customer = isObjectId(customerClaims.sub)
      ? await prisma.customer.findUnique({ where: { id: customerClaims.sub } })
      : null;
    if (customer && !customer.disabled && customer.tokenVersion === customerClaims.v) {
      req.customer = customer;
    } else {
      endCustomerSession(res);
    }
  }
  const adminClaims = verify(req.cookies?.[ADMIN_COOKIE], "admin");
  if (adminClaims) {
    const admin = isObjectId(adminClaims.sub)
      ? await prisma.admin.findUnique({ where: { id: adminClaims.sub } })
      : null;
    if (admin && admin.tokenVersion === adminClaims.v) req.admin = admin;
    else endAdminSession(res);
  }
  next();
};

export const requireCustomer: RequestHandler = (req, _res, next) => {
  next(req.customer ? undefined : unauthorized());
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  next(req.admin ? undefined : unauthorized("Please log in as admin."));
};

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

export function adminActor(req: Request) {
  return { adminId: req.admin?.id ?? null, name: req.admin?.username ?? "system", ip: clientIp(req) };
}
