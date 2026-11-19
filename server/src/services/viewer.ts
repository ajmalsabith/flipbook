import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { Flipbook } from "@prisma/client";
import {
  buildFlipbookHtml,
  escapeHtml,
  viewerInlineScripts,
  type PageImage,
} from "../../../shared/flipbook/buildFlipbookHtml";
import { brandLogoUrl, brandName, colors } from "../../../shared/theme";
import { resolve } from "node:path";
import { env, rootDir } from "../env";
import { flipbookFile, readPages, shareUrl } from "./flipbooks";

const require = createRequire(import.meta.url);

/** StPageFlip 2.0.7, inlined into every viewer page and download. */
export const pageFlipSource = readFileSync(
  require.resolve("page-flip/dist/js/page-flip.browser.js"),
  "utf8"
);

/**
 * Page-turn sound, embedded in every viewer page and download as a data URL
 * so it also plays offline. Replace the file to change the sound.
 */
export const pageTurnSound = (() => {
  const file = resolve(rootDir, "shared/flipbook/page-flip-01a.mp3");
  try {
    return `data:audio/mpeg;base64,${readFileSync(file).toString("base64")}`;
  } catch {
    console.warn(`Page-turn sound not found at ${file}; using the built-in rustle.`);
    return null;
  }
})();

/** CSP sources that allow exactly the viewer's two inline scripts. */
export const viewerScriptHashes = viewerInlineScripts(pageFlipSource).map(
  (script) => `'sha256-${createHash("sha256").update(script, "utf8").digest("base64")}'`
);

const MIME: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  png: "image/png",
};

export function mimeOf(file: string): string {
  return MIME[file.slice(file.lastIndexOf(".") + 1)] ?? "application/octet-stream";
}

function badge(watermarked: boolean) {
  return watermarked ? { text: "Made with", brand: brandName, href: `${env.publicUrl}/?ref=badge` } : null;
}

function description(fb: Flipbook): string {
  return `A ${fb.pageCount}-page flipbook. Tap to turn the pages.`;
}

/** Full-screen viewer for /v/:slug, with Open Graph tags for link previews. */
export function buildShareHtml(fb: Flipbook): string {
  const variant = fb.watermarked ? "m" : "c";
  const version = `${variant}${fb.updatedAt.getTime().toString(36)}`;
  const pages: PageImage[] = readPages(fb).map((p, i) => ({
    src: `/v/${fb.slug}/p/${i + 1}?v=${version}`,
    width: p.w,
    height: p.h,
  }));
  const url = shareUrl(fb.slug);
  const image = `${url}/og.jpg?v=${version}`;
  const title = escapeHtml(fb.title);
  const desc = escapeHtml(description(fb));
  const head = [
    `<meta name="description" content="${desc}">`,
    `<meta name="robots" content="noindex">`,
    `<meta name="theme-color" content="#ffffff">`,
    `<link rel="icon" href="${brandLogoUrl}">`,
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeHtml(brandName)}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${desc}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    `<meta property="og:image:secure_url" content="${escapeHtml(image)}">`,
    `<meta property="og:image:type" content="image/jpeg">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Cover of ${title}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${desc}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
  ].join("\n");

  return buildFlipbookHtml({
    title: fb.title,
    pages,
    showCover: fb.showCover,
    pdf:
      fb.pdfDownload && fb.pdfFile
        ? { fileName: fb.pdfName ?? "document.pdf", url: `/v/${fb.slug}/pdf` }
        : null,
    pageFlipSource,
    sound: pageTurnSound,
    badge: badge(fb.watermarked),
    head,
  });
}

/** The downloadable single-file flipbook, with every image embedded. */
export async function buildDownloadHtml(fb: Flipbook, opts: { watermark: boolean }): Promise<string> {
  const stored = readPages(fb);
  const pages: PageImage[] = await Promise.all(
    stored.map(async (p) => {
      const name = opts.watermark ? p.marked : p.clean;
      const data = await readFile(flipbookFile(fb.id, name));
      return { src: `data:${mimeOf(name)};base64,${data.toString("base64")}`, width: p.w, height: p.h };
    })
  );
  let pdf = null;
  if (fb.pdfDownload && fb.pdfFile) {
    const data = await readFile(flipbookFile(fb.id, fb.pdfFile));
    pdf = { fileName: fb.pdfName ?? "document.pdf", base64: data.toString("base64") };
  }
  return buildFlipbookHtml({
    title: fb.title,
    pages,
    showCover: fb.showCover,
    pdf,
    pageFlipSource,
    sound: pageTurnSound,
    badge: badge(opts.watermark),
  });
}

export type MessagePageAction =
  | { href: string; label: string; primary?: boolean }
  | { formAction: string; label: string; primary?: boolean };

/** Small branded page for expired links, one-time downloads and errors. */
export function messagePage(opts: {
  title: string;
  heading: string;
  text: string;
  tone?: "info" | "warning" | "success";
  actions?: MessagePageAction[];
  note?: string;
}): string {
  const c = colors;
  const toneColor =
    opts.tone === "success" ? c.success[600] : opts.tone === "warning" ? c.accent[500] : c.brand[600];
  const actions = (opts.actions ?? [])
    .map((a) => {
      const cls = a.primary ? "btn primary" : "btn";
      if ("formAction" in a) {
        return `<form method="post" action="${escapeHtml(a.formAction)}"><button class="${cls}" type="submit">${escapeHtml(a.label)}</button></form>`;
      }
      return `<a class="${cls}" href="${escapeHtml(a.href)}">${escapeHtml(a.label)}</a>`;
    })
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)} · ${escapeHtml(brandName)}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="${brandLogoUrl}">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;
  font:16px/1.55 Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:${c.ink[800]};
  background:radial-gradient(ellipse at top,${c.brand[50]},#fff 60%)}
.card{width:100%;max-width:460px;padding:36px 28px;border-radius:20px;background:#fff;text-align:center;
  box-shadow:0 1px 3px rgba(15,23,42,.08),0 20px 50px -20px rgba(15,23,42,.25)}
.brand{display:inline-flex;align-items:center;gap:10px;color:${c.ink[900]};font-weight:700;font-size:19px;text-decoration:none}
.brand img{width:30px;height:30px}
.dot{width:56px;height:56px;margin:28px auto 8px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:${toneColor}1a;color:${toneColor}}
.dot svg{width:28px;height:28px}
h1{margin:12px 0 8px;font-size:23px;line-height:1.3}
p{margin:0;color:${c.ink[600]}}
.actions{display:flex;flex-direction:column;gap:10px;margin-top:26px}
.actions form{margin:0}
.btn{display:block;width:100%;padding:12px 18px;border:1px solid ${c.ink[200]};border-radius:12px;background:#fff;
  color:${c.ink[800]};font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
.btn:hover{background:${c.ink[50]}}
.btn.primary{border-color:${c.brand[600]};background:${c.brand[600]};color:#fff}
.btn.primary:hover{background:${c.brand[700]}}
.btn:focus-visible,.brand:focus-visible{outline:3px solid ${c.brand[300]};outline-offset:2px}
.note{margin-top:18px;font-size:14px;color:${c.ink[500]}}
</style>
</head>
<body>
<main class="card">
<a class="brand" href="/"><img src="${brandLogoUrl}" alt="" width="30" height="30"><span>${escapeHtml(brandName)}</span></a>
<div class="dot" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${
    opts.tone === "success"
      ? '<path d="M20 6L9 17l-5-5"/>'
      : opts.tone === "warning"
        ? '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
        : '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M8 7h8M8 11h6"/>'
  }</svg></div>
<h1>${escapeHtml(opts.heading)}</h1>
<p>${escapeHtml(opts.text)}</p>
${actions ? `<div class="actions">${actions}</div>` : ""}
${opts.note ? `<p class="note">${escapeHtml(opts.note)}</p>` : ""}
</main>
</body>
</html>`;
}
