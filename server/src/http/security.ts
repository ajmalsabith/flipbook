import type { RequestHandler, Response } from "express";
import helmet from "helmet";
import { rateLimit, type Options } from "express-rate-limit";
import { env } from "../env";
import { viewerScriptHashes } from "../services/viewer";
import { forbidden } from "./errors";

/**
 * Content-Security-Policy. Scripts must come from this site, except the
 * flipbook viewer's two inline scripts, which are allowed by hash (they are
 * identical in every flipbook). That also covers the live preview on the
 * Create page, which runs the same viewer in a blob: iframe.
 */
export function cspHeader(opts: { embeddable?: boolean } = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // wasm: pdf.js decodes some image formats with WebAssembly.
    "script-src": ["'self'", "'wasm-unsafe-eval'", ...viewerScriptHashes],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    // pdf.js loads fonts, character maps and decoders for some PDFs from jsDelivr.
    "font-src": ["'self'", "data:", "https://cdn.jsdelivr.net"],
    "connect-src": ["'self'", "https://cdn.jsdelivr.net"],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'", "blob:"],
    // Share links may be embedded in other websites with an <iframe>.
    "frame-ancestors": [opts.embeddable ? "*" : "'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (env.publicUrl.startsWith("https://")) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

const defaultCsp = cspHeader();
const embeddableCsp = cspHeader({ embeddable: true });

export const securityHeaders: RequestHandler[] = [
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    // Framing is controlled by CSP frame-ancestors instead.
    frameguard: false,
    // "no-referrer" (helmet's default) makes browsers send "Origin: null" on
    // form posts, which the same-origin check would then refuse.
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    strictTransportSecurity: env.publicUrl.startsWith("https://")
      ? { maxAge: 31536000, includeSubDomains: false }
      : false,
  }),
  (_req, res, next) => {
    res.setHeader("Content-Security-Policy", defaultCsp);
    next();
  },
];

/** For /v/:slug pages, which may be embedded on other sites. */
export function allowEmbedding(res: Response): void {
  res.setHeader("Content-Security-Policy", embeddableCsp);
}

/**
 * Blocks cross-site form posts and fetches. Together with SameSite=Lax
 * cookies this protects against CSRF.
 */
export const sameOrigin: RequestHandler = (req, _res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  // Modern browsers say exactly where a request comes from.
  const site = req.get("sec-fetch-site");
  if (site) {
    return next(site === "same-origin" || site === "none" ? undefined : forbidden("Cross-site request blocked."));
  }
  // Older browsers: compare Origin with Host. No Origin = not a browser.
  const origin = req.get("origin");
  if (!origin) return next();
  try {
    if (new URL(origin).host === req.get("host")) return next();
  } catch {
    // "null" or malformed
  }
  next(forbidden("Cross-site request blocked."));
};

function limiter(windowMinutes: number, limit: number, extra: Partial<Options> = {}) {
  return rateLimit({
    windowMs: windowMinutes * 60_000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: (_req, res) => {
      res.status(429).json({
        error: "rate_limited",
        message: "Too many attempts. Please wait a few minutes and try again.",
      });
    },
    ...extra,
  });
}

export const limits = {
  login: limiter(15, 10, { skipSuccessfulRequests: true }),
  adminLogin: limiter(15, 8, { skipSuccessfulRequests: true }),
  upload: limiter(60, 30),
  createRequest: limiter(60, 10),
  requestStatus: limiter(15, 60),
  download: limiter(60, 60),
  instant: limiter(15, 30),
};
