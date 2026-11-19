import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import sharp from "sharp";
import { brandName, colors } from "../../../shared/theme";
import { escapeHtml } from "../../../shared/flipbook/buildFlipbookHtml";
import { env } from "../env";
import { badRequest } from "../http/errors";

// sharp's file cache keeps handles open, which stops Windows from deleting
// or moving the files afterwards.
sharp.cache(false);

export type PageFormat = "webp" | "jpeg" | "png";
export type PageInfo = { format: PageFormat; width: number; height: number };

const MAX_SIDE = 8000;
const FONT = "Inter, 'Segoe UI', 'DejaVu Sans', Arial, Helvetica, sans-serif";

/** Checks that an uploaded page really is a single still image of sane size. */
export async function inspectPageImage(path: string, label: string): Promise<PageInfo> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(path).metadata();
  } catch {
    throw badRequest(`${label} is not a valid image.`);
  }
  const format = meta.format as string;
  if (format !== "webp" && format !== "jpeg" && format !== "png") {
    throw badRequest(`${label} must be a WebP, JPEG or PNG image.`);
  }
  const { width = 0, height = 0 } = meta;
  if (width < 16 || height < 16 || width > MAX_SIDE || height > MAX_SIDE) {
    throw badRequest(`${label} has an unsupported size (${width}x${height}).`);
  }
  if ((meta.pages ?? 1) > 1) throw badRequest(`${label} must not be animated.`);
  return { format, width, height };
}

let logoDataUri: Promise<string | null> | null = null;

function loadLogo(): Promise<string | null> {
  if (!logoDataUri) {
    logoDataUri = readFile(env.brandLogoPath)
      .then((data) => {
        const ext = extname(env.brandLogoPath).toLowerCase();
        const mime =
          ext === ".svg" ? "image/svg+xml" : ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
        return `data:${mime};base64,${data.toString("base64")}`;
      })
      .catch((err) => {
        console.warn(`Watermark logo not found at ${env.brandLogoPath}:`, err.message);
        return null;
      });
  }
  return logoDataUri;
}

/** Diagonal repeated text over the whole page plus the logo in the corner. */
async function watermarkOverlay(width: number, height: number, text: string): Promise<Buffer> {
  const fontSize = Math.round(Math.max(16, Math.min(width, height) / 13));
  const textWidth = fontSize * 0.62 * text.length;
  const stepX = textWidth + fontSize * 2.4;
  const stepY = fontSize * 4.2;
  const diag = Math.hypot(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const label = escapeHtml(text);
  const rows: string[] = [];
  let row = 0;
  for (let y = cy - diag / 2; y <= cy + diag / 2; y += stepY, row++) {
    const offset = row % 2 ? stepX / 2 : 0;
    for (let x = cx - diag / 2 - offset; x <= cx + diag / 2; x += stepX) {
      rows.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}">${label}</text>`);
    }
  }
  const logo = await loadLogo();
  const logoSize = Math.round(Math.max(36, Math.min(width, height) * 0.09));
  const margin = Math.round(Math.max(10, Math.min(width, height) * 0.03));
  const logoTag = logo
    ? `<rect x="${width - logoSize - margin * 1.6}" y="${height - logoSize - margin * 1.6}" width="${logoSize + margin * 1.2}" height="${logoSize + margin * 1.2}" rx="${margin * 0.6}" fill="#fff" fill-opacity=".7"/>` +
      `<image href="${logo}" x="${width - logoSize - margin}" y="${height - logoSize - margin}" width="${logoSize}" height="${logoSize}" opacity=".85" preserveAspectRatio="xMidYMid meet"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">
<g transform="rotate(-30 ${cx} ${cy})" font-family="${FONT}" font-size="${fontSize}" font-weight="700"
 fill="#000" fill-opacity=".11" stroke="#fff" stroke-opacity=".22" stroke-width="${Math.max(1, fontSize / 28).toFixed(1)}">
${rows.join("\n")}
</g>
${logoTag}
</svg>`;
  return Buffer.from(svg);
}

export async function writeWatermarked(
  input: string,
  output: string,
  info: { width: number; height: number },
  text: string
): Promise<void> {
  const overlay = await watermarkOverlay(info.width, info.height, text);
  await sharp(input)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .webp({ quality: 80 })
    .toFile(output);
}

/**
 * 1200x630 JPEG for link previews (WhatsApp, Facebook, X): the cover page on
 * a soft background with the logo.
 */
export async function writeOgImage(pagePath: string, output: string): Promise<void> {
  const W = 1200;
  const H = 630;
  const page = await sharp(pagePath)
    .resize({ width: 980, height: 520, fit: "inside" })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const pw = page.info.width;
  const ph = page.info.height;
  const left = Math.round((W - pw) / 2);
  const top = Math.round((H - ph) / 2) - 14;
  const logo = await loadLogo();
  const c = colors;
  const background = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.brand[50]}"/><stop offset=".6" stop-color="#ffffff"/><stop offset="1" stop-color="${c.accent[50]}"/></linearGradient>
<filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<circle cx="70" cy="80" r="120" fill="${c.logo.orange}" fill-opacity=".12"/>
<circle cx="1140" cy="560" r="150" fill="${c.logo.blue}" fill-opacity=".10"/>
<circle cx="1120" cy="70" r="60" fill="${c.logo.red}" fill-opacity=".10"/>
<rect x="${left + 6}" y="${top + 16}" width="${pw - 12}" height="${ph}" rx="4" fill="#0f172a" fill-opacity=".28" filter="url(#blur)"/>
${logo ? `<image href="${logo}" x="${W - 228}" y="${H - 50}" width="34" height="34"/>` : ""}
<text x="${W - 186}" y="${H - 24}" font-family="${FONT}" font-size="24" font-weight="700" fill="${c.ink[800]}">${escapeHtml(brandName)}</text>
</svg>`;
  await sharp(Buffer.from(background))
    .composite([{ input: page.data, left, top }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(output);
}

/** Small JPEG of the cover for dashboards. */
export async function coverThumbnail(pagePath: string): Promise<Buffer> {
  return sharp(pagePath)
    .resize({ width: 360, height: 360, fit: "inside" })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 78 })
    .toBuffer();
}

/** Renders an SVG string to a WebP page (used for the demo flipbook). */
export async function svgToWebp(svg: string, output: string): Promise<void> {
  await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(output);
}
