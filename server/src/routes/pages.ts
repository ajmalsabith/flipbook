import { Router, type Request, type Response } from "express";
import type { Flipbook } from "@prisma/client";
import { whatsappLink } from "../../../shared/phone";
import { noValue, prisma, transaction } from "../db";
import { clientIp } from "../http/auth";
import { allowEmbedding, limits } from "../http/security";
import { instantTokenStatus, shareLinkStatus } from "../services/entitlement";
import { fileSlug, flipbookFile, readPages } from "../services/flipbooks";
import { getSettings } from "../services/settings";
import { formatDateTime } from "../services/time";
import { buildDownloadHtml, buildShareHtml, messagePage, mimeOf } from "../services/viewer";

export const pagesRouter = Router();

// Link-preview fetchers and crawlers do not count as views.
const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|facebot|whatsapp|telegram|twitter|slack|discord|linkedin|skype|preview|embedly|pinterest|vkshare|headless/i;

// Paths come from flipbookFile(), never from the URL, so a dot-folder in
// UPLOAD_DIR (e.g. /home/app/.data/uploads) is fine.
const FILE_OPTIONS = { dotfiles: "allow" as const };

function sendPage(res: Response, status: number, html: string) {
  res.status(status).setHeader("Cache-Control", "no-store");
  res.type("html").send(html);
}

function notFoundPage(res: Response) {
  sendPage(
    res,
    404,
    messagePage({
      title: "Not found",
      heading: "Flipbook not found",
      text: "Check the link, or ask the person who sent it for a new one.",
      actions: [
        { href: "/", label: "Go to the home page", primary: true },
        { href: "/create", label: "Make your own flipbook" },
      ],
    })
  );
}

function expiredPage(res: Response, fb: Flipbook, status: ReturnType<typeof shareLinkStatus>) {
  const disabled = status === "disabled";
  sendPage(
    res,
    410,
    messagePage({
      title: "Link expired",
      tone: "warning",
      heading: disabled ? "This flipbook is no longer available" : "This flipbook link has expired",
      text: disabled
        ? "This link has been turned off."
        : `Share links stay open for a limited time, and the link to "${fb.title}" has ended. Ask the sender for a new link, or make your own flipbook.`,
      actions: [
        { href: "/", label: "Go to the home page", primary: true },
        { href: "/create", label: "Make your own flipbook" },
      ],
    })
  );
}

/** The flipbook behind /v/:slug if it may be shown (admins may see any). */
async function viewable(req: Request): Promise<Flipbook | null> {
  const fb = await prisma.flipbook.findUnique({ where: { slug: String(req.params.slug) } });
  if (!fb) return null;
  if (req.admin && !fb.filesDeleted) return fb;
  return shareLinkStatus(fb, new Date()) === "active" ? fb : null;
}

pagesRouter.get("/v/:slug", async (req, res) => {
  const fb = await prisma.flipbook.findUnique({ where: { slug: String(req.params.slug) } });
  if (!fb) return notFoundPage(res);
  const status = shareLinkStatus(fb, new Date());
  if (status !== "active" && !(req.admin && status !== "deleted")) return expiredPage(res, fb, status);

  // ?preview=1 is the maker's own preview right after saving.
  if (!req.admin && req.query.preview !== "1" && !BOT_UA.test(req.get("user-agent") ?? "")) {
    void prisma.flipbook
      .update({ where: { id: fb.id }, data: { views: { increment: 1 } } })
      .catch(() => undefined);
  }
  allowEmbedding(res);
  res.setHeader("Cache-Control", "no-cache");
  res.type("html").send(buildShareHtml(fb));
});

pagesRouter.get("/v/:slug/p/:n", async (req, res) => {
  const fb = await viewable(req);
  const n = Number(req.params.n);
  const pages = fb ? readPages(fb) : [];
  if (!fb || !Number.isInteger(n) || n < 1 || n > pages.length) return res.status(404).end();
  // The variant is chosen here, never from the URL: a watermarked flipbook
  // can not be made to serve its clean images.
  const name = fb.watermarked ? pages[n - 1].marked : pages[n - 1].clean;
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.type(mimeOf(name)).sendFile(flipbookFile(fb.id, name), FILE_OPTIONS);
});

pagesRouter.get("/v/:slug/og.jpg", async (req, res) => {
  const fb = await viewable(req);
  const name = fb ? (fb.watermarked ? fb.ogMarkedFile : fb.ogFile) : null;
  if (!fb || !name) return res.status(404).end();
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.type("jpeg").sendFile(flipbookFile(fb.id, name), FILE_OPTIONS);
});

pagesRouter.get("/v/:slug/pdf", async (req, res) => {
  const fb = await viewable(req);
  if (!fb || !fb.pdfDownload || !fb.pdfFile) return res.status(404).end();
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.download(flipbookFile(fb.id, fb.pdfFile), fb.pdfName ?? "document.pdf", FILE_OPTIONS);
});

// ---- One-time download links (instant purchase) ----------------------------

async function contactAction() {
  const settings = await getSettings();
  return {
    href: whatsappLink(settings.whatsappNumber, "Hi, my one-time download link is not working."),
    label: "Message us on WhatsApp",
  };
}

async function tokenProblemPage(res: Response, state: "missing" | "used" | "expired" | "revoked") {
  const heading =
    state === "used"
      ? "This download link has already been used"
      : state === "missing"
        ? "This download link is not valid"
        : "This download link has expired";
  const text =
    state === "used"
      ? "Each instant-download link works once. If the download did not finish, message us and we will send a new link."
      : "Message us on WhatsApp and we will help you.";
  sendPage(
    res,
    state === "missing" ? 404 : 410,
    messagePage({
      title: "Download link",
      tone: "warning",
      heading,
      text,
      actions: [{ ...(await contactAction()), primary: true }, { href: "/", label: "Go to the home page" }],
    })
  );
}

// Opening the link only shows a button. WhatsApp fetches links to build a
// preview, so a GET must never use up the one-time download.
pagesRouter.get("/d/:token", limits.instant, async (req, res) => {
  const token = await prisma.instantToken.findUnique({
    where: { token: String(req.params.token) },
    include: { flipbook: true },
  });
  if (!token || token.flipbook.filesDeleted) return tokenProblemPage(res, "missing");
  const state = instantTokenStatus(token, new Date());
  if (state !== "ok") return tokenProblemPage(res, state);
  sendPage(
    res,
    200,
    messagePage({
      title: "Your download",
      tone: "success",
      heading: "Your flipbook is ready",
      text: `"${token.flipbook.title}" · ${token.flipbook.pageCount} pages · no watermark.`,
      actions: [{ formAction: `/d/${token.token}`, label: "Download flipbook", primary: true }],
      note: `This link works once and expires on ${formatDateTime(token.expiresAt)}. Keep the downloaded file safe.`,
    })
  );
});

pagesRouter.post("/d/:token", limits.instant, async (req, res) => {
  const now = new Date();
  const result = await transaction(async (tx) => {
    const token = await tx.instantToken.findUnique({
      where: { token: String(req.params.token) },
      include: { flipbook: true },
    });
    if (!token || token.flipbook.filesDeleted) return { problem: "missing" as const };
    const state = instantTokenStatus(token, now);
    if (state !== "ok") return { problem: state };
    // Conditional update: only one request can ever win this.
    const claimed = await tx.instantToken.updateMany({
      where: { id: token.id, status: "active", expiresAt: { gt: now }, ...noValue("usedAt") },
      data: { status: "used", usedAt: now, usedIp: clientIp(req) },
    });
    if (claimed.count !== 1) return { problem: "used" as const };
    await tx.downloadEvent.create({
      data: { flipbookId: token.flipbookId, ip: clientIp(req), kind: "instant", watermarked: false },
    });
    await tx.flipbook.update({ where: { id: token.flipbookId }, data: { downloads: { increment: 1 } } });
    return { token };
  });
  if (result.problem || !result.token) return tokenProblemPage(res, result.problem ?? "missing");

  const { token } = result;
  let html: string;
  try {
    html = await buildDownloadHtml(token.flipbook, { watermark: false });
  } catch (err) {
    // Could not build the file: give the link back.
    await prisma.instantToken.update({
      where: { id: token.id },
      data: { status: "active", usedAt: null, usedIp: null },
    });
    throw err;
  }
  res.attachment(`${fileSlug(token.flipbook.title)}.html`);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
});
