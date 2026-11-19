// Turns each page of a PDF into an image, entirely in the browser.
// Ported from the Hightemp flipbook maker. Changes: pages are returned as
// Blobs with object URLs (much less memory than data URLs, and ready to
// upload), the page limit is checked before converting, and pdf.js's worker
// is bundled by Vite.

import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

export type PageImage = {
  /** WebP (or JPEG where the browser can't encode WebP) */
  blob: Blob;
  /** Object URL of `blob`, for the preview */
  url: string;
  width: number;
  height: number;
};

export type Quality = "standard" | "high";

export const QUALITY_PRESETS: Record<Quality, { label: string; targetWidth: number; imageQuality: number }> = {
  standard: { label: "Standard", targetWidth: 1400, imageQuality: 0.8 },
  high: { label: "High", targetWidth: 2200, imageQuality: 0.9 },
};

// WebP is much smaller than JPEG for pages of text. Browsers that can't
// encode it (older Safari) silently return PNG instead, so check first.
function imageType(): "image/webp" | "image/jpeg" {
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  return probe.toDataURL("image/webp").startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
}

// Keeps very large pages (posters, drawings) from creating canvases that
// browsers refuse to allocate.
const MAX_PIXELS_PER_PAGE = 12_000_000;

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs")
      .then((pdfjs) => {
        // Served as its own file from our site, so it is cached separately.
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(pdfWorkerUrl, { type: "module" });
        return pdfjs;
      })
      .catch((err) => {
        pdfjsPromise = null;
        throw err;
      });
  }
  return pdfjsPromise;
}

export class TooManyPagesError extends Error {
  constructor(
    public pages: number,
    public limit: number
  ) {
    super(`This PDF has ${pages} pages. The limit is ${limit} pages.`);
    this.name = "TooManyPagesError";
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("could not encode the page"))), type, quality)
  );
}

export async function convertPdfToImages(
  file: File,
  options: {
    quality: Quality;
    maxPages: number;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  }
): Promise<PageImage[]> {
  const { targetWidth, imageQuality } = QUALITY_PRESETS[options.quality];
  const type = imageType();
  const pdfjs = await loadPdfJs();
  options.signal?.throwIfAborted();

  // Fonts, CJK character maps and image/colour decoders are only fetched when
  // a PDF needs them. They come from the CDN at the exact matching version so
  // they don't have to be copied into the site build.
  const assets = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/`;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`,
    iccUrl: `${assets}iccs/`,
  });
  const abort = () => void task.destroy();
  options.signal?.addEventListener("abort", abort);

  const pages: PageImage[] = [];
  try {
    const doc = await task.promise;
    if (doc.numPages > options.maxPages) throw new TooManyPagesError(doc.numPages, options.maxPages);
    const canvas = document.createElement("canvas");
    options.onProgress?.(0, doc.numPages);

    for (let n = 1; n <= doc.numPages; n++) {
      options.signal?.throwIfAborted();
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(
        targetWidth / base.width,
        Math.sqrt(MAX_PIXELS_PER_PAGE / (base.width * base.height))
      );
      const viewport = page.getViewport({ scale });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);

      await page.render({ canvas, viewport, background: "#ffffff" }).promise;
      const blob = await canvasToBlob(canvas, type, imageQuality);
      pages.push({ blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height });
      page.cleanup();
      options.onProgress?.(n, doc.numPages);
    }

    // Release the canvas memory straight away.
    canvas.width = canvas.height = 0;
    return pages;
  } catch (err) {
    releasePages(pages);
    throw err;
  } finally {
    options.signal?.removeEventListener("abort", abort);
    await task.destroy();
  }
}

export function releasePages(pages: PageImage[]): void {
  for (const p of pages) URL.revokeObjectURL(p.url);
}

export function describePdfError(err: unknown): string {
  if (err instanceof TooManyPagesError) return err.message;
  const name = (err as { name?: string } | null)?.name;
  if (name === "PasswordException") {
    return "This PDF is password protected. Remove the password and try again.";
  }
  if (name === "InvalidPDFException") {
    return "This file is not a valid PDF, or it is damaged.";
  }
  const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
  return `Could not convert this PDF${detail}.`;
}
