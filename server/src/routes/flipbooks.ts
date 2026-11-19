import { Router, type Request } from "express";
import multer from "multer";
import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { DenyReason } from "../../../shared/api";
import { noValue, prisma } from "../db";
import { env } from "../env";
import { badRequest, HttpError, notFound } from "../http/errors";
import { limits } from "../http/security";
import { chargeDownload, refundDownload } from "../services/downloads";
import { newFlipbookTerms } from "../services/entitlement";
import {
  createFlipbook,
  deleteFlipbook,
  fileSlug,
  flipbookFile,
  readPages,
  toSummary,
  type UploadedFile,
} from "../services/flipbooks";
import { randomToken } from "../services/ids";
import { coverThumbnail } from "../services/images";
import { getSettings } from "../services/settings";
import { buildDownloadHtml } from "../services/viewer";
import { downloadActor } from "./public";

export const flipbooksRouter = Router();

const tmpDir = join(env.uploadDir, ".tmp");
mkdirSync(tmpDir, { recursive: true });

const MAX_PAGE_BYTES = 15 * 1024 * 1024;

/** The flipbook if the current customer or browser owns it, else 404. */
export async function ownedFlipbook(req: Request, id: string | string[]) {
  const fb = await prisma.flipbook.findUnique({ where: { id: String(id) } });
  const owns =
    fb &&
    ((req.customer && fb.customerId === req.customer.id) ||
      (!fb.customerId && fb.visitorId === req.visitorId));
  if (!fb || !owns) throw notFound("Flipbook not found.");
  return fb;
}

const boolField = z.enum(["true", "false"]).transform((v) => v === "true");
const uploadFields = z.object({
  title: z.string().trim().max(120).transform((t) => t || "Flipbook"),
  showCover: boolField,
  pdfDownload: boolField,
});

flipbooksRouter.post("/", limits.upload, async (req, res) => {
  const settings = await getSettings();
  const upload = multer({
    storage: multer.diskStorage({
      destination: tmpDir,
      filename: (_req, _file, cb) => cb(null, randomToken(16)),
    }),
    limits: {
      fileSize: Math.max(settings.maxPdfMb * 1024 * 1024, MAX_PAGE_BYTES),
      files: settings.maxPages + 1,
      fields: 10,
      fieldSize: 10_000,
    },
  }).fields([
    { name: "pages", maxCount: settings.maxPages },
    { name: "pdf", maxCount: 1 },
  ]);

  await new Promise<void>((resolve, reject) =>
    upload(req, res, (err: unknown) => (err ? reject(err) : resolve()))
  );
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  const all: UploadedFile[] = [...(files.pages ?? []), ...(files.pdf ?? [])];
  try {
    const fields = uploadFields.parse(req.body);
    const pages = files.pages ?? [];
    const oversized = pages.findIndex((p) => p.size > MAX_PAGE_BYTES);
    if (oversized >= 0) throw badRequest(`Page ${oversized + 1} is larger than 15 MB.`);

    const now = new Date();
    const terms = newFlipbookTerms(
      req.customer ? { kind: "customer", plan: req.customer } : { kind: "visitor" },
      settings.freeLinkHours,
      now
    );
    const fb = await createFlipbook({
      ...fields,
      pages,
      pdf: files.pdf?.[0] ?? null,
      owner: {
        customerId: req.customer?.id ?? null,
        visitorId: req.visitorId,
      },
      terms,
      settings,
    });
    res.status(201).json(toSummary(fb, now));
  } finally {
    // Moved files are already gone; this removes anything left behind.
    await Promise.all(all.map((f) => rm(f.path, { force: true })));
  }
});

flipbooksRouter.get("/", async (req, res) => {
  const where = req.customer
    ? { customerId: req.customer.id }
    : { visitorId: req.visitorId, filesDeleted: false, ...noValue("customerId") };
  const books = await prisma.flipbook.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
  const now = new Date();
  res.setHeader("Cache-Control", "no-store");
  res.json(books.map((b) => toSummary(b, now)));
});

flipbooksRouter.get("/:id", async (req, res) => {
  res.json(toSummary(await ownedFlipbook(req, req.params.id)));
});

const patchSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a title.").max(120),
    showCover: z.boolean(),
    pdfDownload: z.boolean(),
  })
  .partial()
  .strict();

flipbooksRouter.patch("/:id", async (req, res) => {
  const fb = await ownedFlipbook(req, req.params.id);
  const data = patchSchema.parse(req.body);
  if (data.pdfDownload && !fb.pdfFile) {
    throw badRequest("This flipbook was saved without its PDF, so the button cannot be added.");
  }
  const updated = await prisma.flipbook.update({ where: { id: fb.id }, data });
  res.json(toSummary(updated));
});

flipbooksRouter.delete("/:id", async (req, res) => {
  const fb = await ownedFlipbook(req, req.params.id);
  await deleteFlipbook(fb.id);
  res.json({ ok: true });
});

export function denyMessage(reason: DenyReason, freeLimit: number): string {
  switch (reason) {
    case "free_limit":
      return `You have used all ${freeLimit} free downloads.`;
    case "ip_limit":
      return "Too many free downloads from this network today. Please try again tomorrow, or remove the limit with a plan.";
    case "plan_expired":
      return "Your plan has expired. Choose a new plan to keep downloading.";
    case "plan_limit":
      return "You have used all the downloads in your plan.";
    case "no_plan":
      return "Your account has no active plan.";
    case "account_disabled":
      return "This account is disabled.";
  }
}

/**
 * Builds the single-file flipbook on the server: watermarked or clean
 * depending on what the visitor or customer is entitled to. The allowance is
 * checked and the download counted in the same transaction.
 */
flipbooksRouter.post("/:id/download", limits.download, async (req, res) => {
  const fb = await ownedFlipbook(req, req.params.id);
  if (fb.filesDeleted) throw new HttpError(410, "gone", "This flipbook's files have been deleted.");
  const actor = downloadActor(req);
  const charged = await chargeDownload(actor, fb.id);
  if (!charged.allowed) {
    const settings = await getSettings();
    throw new HttpError(403, "download_denied", denyMessage(charged.reason, settings.freeDownloadLimit), {
      reason: charged.reason,
    });
  }
  let html: string;
  try {
    html = await buildDownloadHtml(fb, { watermark: charged.watermark });
  } catch (err) {
    await refundDownload(actor, charged.eventId!, fb.id);
    throw err;
  }
  res.attachment(`${fileSlug(fb.title)}.html`);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Watermarked", charged.watermark ? "1" : "0");
  res.setHeader("X-Downloads-Remaining", charged.remaining === null ? "unlimited" : String(charged.remaining));
  res.send(html);
});

flipbooksRouter.get("/:id/thumb", async (req, res) => {
  const fb = req.admin
    ? await prisma.flipbook.findUnique({ where: { id: String(req.params.id) } })
    : await ownedFlipbook(req, req.params.id);
  if (!fb || fb.filesDeleted) throw notFound();
  const page = readPages(fb)[0];
  const image = await coverThumbnail(flipbookFile(fb.id, fb.watermarked ? page.marked : page.clean));
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.type("jpeg").send(image);
});
