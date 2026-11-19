import { mkdir, open, rename, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Flipbook } from "@prisma/client";
import type { FlipbookSummary } from "../../../shared/api";
import { prisma } from "../db";
import { env } from "../env";
import { badRequest } from "../http/errors";
import { shareLinkStatus } from "./entitlement";
import { flipbookId, randomFileName, shareSlug } from "./ids";
import { inspectPageImage, writeOgImage, writeWatermarked, type PageInfo } from "./images";
import type { Settings } from "./settings";

export type StoredPage = { clean: string; marked: string; w: number; h: number };

export function readPages(fb: Pick<Flipbook, "pages">): StoredPage[] {
  return JSON.parse(fb.pages) as StoredPage[];
}

const ID_PATTERN = /^[a-z0-9]{8,40}$/;
const FILE_PATTERN = /^[a-z0-9]{8,40}\.(webp|jpg|png|pdf)$/;

/** uploads/<flipbookId>/ - the id is checked so it can never leave UPLOAD_DIR. */
export function flipbookDir(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid flipbook id: ${id}`);
  return join(env.uploadDir, id);
}

export function flipbookFile(id: string, name: string): string {
  if (!FILE_PATTERN.test(name)) throw new Error(`Invalid file name: ${name}`);
  return join(flipbookDir(id), name);
}

export function shareUrl(slug: string): string {
  return `${env.publicUrl}/v/${slug}`;
}

export function toSummary(fb: Flipbook, now = new Date()): FlipbookSummary {
  return {
    id: fb.id,
    slug: fb.slug,
    title: fb.title,
    pageCount: fb.pageCount,
    showCover: fb.showCover,
    pdfDownload: fb.pdfDownload,
    hasPdf: !!fb.pdfFile,
    watermarked: fb.watermarked,
    views: fb.views,
    downloads: fb.downloads,
    createdAt: fb.createdAt.toISOString(),
    linkExpiresAt: fb.linkExpiresAt.toISOString(),
    linkStatus: shareLinkStatus(fb, now),
    shareUrl: shareUrl(fb.slug),
    thumbUrl: `/api/flipbooks/${fb.id}/thumb?v=${fb.watermarked ? "m" : "c"}`,
  };
}

/** "My Report (final).pdf" -> "my-report-final" */
export function fileSlug(title: string): string {
  const slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "flipbook";
}

function cleanPdfName(original: string, title: string): string {
  const base = basename(original.replace(/\\/g, "/"))
    .replace(/[^\p{L}\p{N} ._()-]+/gu, "")
    .trim()
    .slice(0, 100);
  if (/\.pdf$/i.test(base) && base.length > 4) return base;
  return `${fileSlug(title)}.pdf`;
}

async function isPdfFile(path: string): Promise<boolean> {
  const handle = await open(path, "r");
  try {
    const head = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(head, 0, head.length, 0);
    // The header may follow a few junk bytes; readers accept it in the first 1 KB.
    return head.subarray(0, bytesRead).includes("%PDF-");
  } finally {
    await handle.close();
  }
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await fn(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function uniqueSlug(): Promise<string> {
  for (;;) {
    const slug = shareSlug();
    if (!(await prisma.flipbook.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
}

export type UploadedFile = { path: string; size: number; mimetype: string; originalname: string };

export type CreateFlipbookInput = {
  title: string;
  showCover: boolean;
  pdfDownload: boolean;
  pages: UploadedFile[];
  pdf: UploadedFile | null;
  owner: { customerId: string | null; visitorId: string | null };
  terms: { watermarked: boolean; linkExpiresAt: Date };
  settings: Settings;
};

/**
 * Validates the uploaded pages, stores a clean and a watermarked copy of each
 * under uploads/<id>/ with random names, makes the link-preview images and
 * saves the flipbook. Nothing is kept if any step fails.
 */
export async function createFlipbook(input: CreateFlipbookInput): Promise<Flipbook> {
  const { pages, pdf, settings } = input;
  if (pages.length === 0) throw badRequest("Upload at least one page.");
  if (pages.length > settings.maxPages) {
    throw badRequest(`This PDF has more than ${settings.maxPages} pages, the current limit.`);
  }

  const infos: PageInfo[] = [];
  for (let i = 0; i < pages.length; i++) {
    infos.push(await inspectPageImage(pages[i].path, `Page ${i + 1}`));
  }
  if (input.pdfDownload) {
    if (!pdf) throw badRequest("The PDF file is missing.");
    if (pdf.size > settings.maxPdfMb * 1024 * 1024) {
      throw badRequest(`The PDF is larger than ${settings.maxPdfMb} MB.`);
    }
    if (pdf.mimetype !== "application/pdf" || !(await isPdfFile(pdf.path))) {
      throw badRequest("The attached file is not a PDF.");
    }
  }

  const id = flipbookId();
  const dir = flipbookDir(id);
  await mkdir(dir, { recursive: true });
  try {
    const stored: StoredPage[] = new Array(pages.length);
    await mapLimit(pages, 4, async (file, i) => {
      const info = infos[i];
      const clean = randomFileName(info.format === "jpeg" ? "jpg" : info.format);
      const marked = randomFileName("webp");
      await rename(file.path, join(dir, clean));
      await writeWatermarked(join(dir, clean), join(dir, marked), info, settings.watermarkText);
      stored[i] = { clean, marked, w: info.width, h: info.height };
    });

    const ogFile = randomFileName("jpg");
    const ogMarkedFile = randomFileName("jpg");
    await writeOgImage(join(dir, stored[0].clean), join(dir, ogFile));
    await writeOgImage(join(dir, stored[0].marked), join(dir, ogMarkedFile));

    let pdfFile: string | null = null;
    let pdfName: string | null = null;
    if (input.pdfDownload && pdf) {
      pdfFile = randomFileName("pdf");
      pdfName = cleanPdfName(pdf.originalname, input.title);
      await rename(pdf.path, join(dir, pdfFile));
    }

    return await prisma.flipbook.create({
      data: {
        id,
        slug: await uniqueSlug(),
        title: input.title,
        showCover: input.showCover,
        pdfDownload: !!pdfFile,
        pageCount: stored.length,
        pageWidth: stored[0].w,
        pageHeight: stored[0].h,
        pages: JSON.stringify(stored),
        pdfFile,
        pdfName,
        ogFile,
        ogMarkedFile,
        watermarked: input.terms.watermarked,
        linkExpiresAt: input.terms.linkExpiresAt,
        customerId: input.owner.customerId,
        visitorId: input.owner.visitorId,
      },
    });
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}

export async function deleteFlipbookFiles(id: string): Promise<void> {
  await rm(flipbookDir(id), { recursive: true, force: true });
}

/** Deletes the flipbook and its files. */
export async function deleteFlipbook(id: string): Promise<void> {
  await prisma.flipbook.delete({ where: { id } });
  await deleteFlipbookFiles(id);
}
