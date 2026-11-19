import pageFlipSource from "page-flip/dist/js/page-flip.browser.js?raw";
// Same page-turn sound the server embeds in share links and downloads.
import pageTurnSound from "@shared/flipbook/page-flip-01a.mp3?url&inline";
import type { FlipbookSummary } from "@shared/api";
import { buildFlipbookHtml } from "@shared/flipbook/buildFlipbookHtml";
import { ApiError } from "../lib/api";
import type { PageImage } from "./convertPdf";

/**
 * The live preview: the same viewer the server uses for share links and
 * downloads, built in the browser from the converted pages. Free users see
 * the watermark text over the pages, as in their download.
 */
export function buildPreviewUrl(opts: {
  title: string;
  pages: PageImage[];
  showCover: boolean;
  /** The preview's button downloads the original file straight from memory. */
  pdf: { name: string; url: string } | null;
  overlayText: string | null;
}): string {
  const html = buildFlipbookHtml({
    title: opts.title,
    pages: opts.pages.map((p) => ({ src: p.url, width: p.width, height: p.height })),
    showCover: opts.showCover,
    pdf: opts.pdf ? { fileName: opts.pdf.name, url: opts.pdf.url } : null,
    pageFlipSource,
    sound: pageTurnSound,
    overlayText: opts.overlayText,
  });
  return URL.createObjectURL(new Blob([html], { type: "text/html" }));
}

/** Uploads the page images (and optionally the PDF), reporting progress. */
export function uploadFlipbook(
  data: {
    title: string;
    showCover: boolean;
    pdf: File | null;
    pages: PageImage[];
  },
  onProgress: (fraction: number) => void
): Promise<FlipbookSummary> {
  const form = new FormData();
  form.append("title", data.title);
  form.append("showCover", String(data.showCover));
  form.append("pdfDownload", String(!!data.pdf));
  data.pages.forEach((p, i) => {
    const ext = p.blob.type === "image/webp" ? "webp" : "jpg";
    form.append("pages", p.blob, `page-${String(i + 1).padStart(3, "0")}.${ext}`);
  });
  if (data.pdf) form.append("pdf", data.pdf, data.pdf.name);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/flipbooks");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as FlipbookSummary);
      else {
        const body = xhr.response ?? {
          error: `http_${xhr.status}`,
          message: xhr.status === 413 ? "The upload is too large." : "The upload failed. Please try again.",
        };
        reject(new ApiError(xhr.status, body));
      }
    };
    xhr.onerror = () =>
      reject(new ApiError(0, { error: "network", message: "The upload failed. Check your connection and try again." }));
    xhr.send(form);
  });
}

export function titleFromFileName(name: string): string {
  return name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 120);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
