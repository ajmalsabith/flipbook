// npm run db:seed
//   Creates the default plans, settings, the first admin (from ADMIN_USERNAME /
//   ADMIN_PASSWORD) and the demo flipbook shown on the home page. Safe to run
//   again: it only adds what is missing and never overwrites your edits.
//
// npm run admin:reset-password
//   Sets the admin's password to ADMIN_PASSWORD from .env (use it if the
//   admin password is lost).

import bcrypt from "bcryptjs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { brandName, colors } from "../../shared/theme";
import { escapeHtml } from "../../shared/flipbook/buildFlipbookHtml";
import { prisma } from "./db";
import { env } from "./env";
import { BCRYPT_ROUNDS } from "./services/customers";
import { flipbookDir, type StoredPage } from "./services/flipbooks";
import { flipbookId, randomFileName } from "./services/ids";
import { svgToWebp, writeOgImage, writeWatermarked } from "./services/images";
import { ensureSettings, getSettings } from "./services/settings";

const DEFAULT_PLANS = [
  {
    code: "instant",
    name: "Instant download",
    tagline: "One flipbook, no watermark",
    type: "instant",
    price: 99,
    downloadLimit: 1,
    validityHours: 48,
    shareLinkDays: 7,
    watermark: false,
    highlight: false,
    sortOrder: 1,
  },
  {
    code: "day",
    name: "1-Day Pass",
    tagline: "For a quick project",
    type: "subscription",
    price: 199,
    downloadLimit: 5,
    validityHours: 24,
    shareLinkDays: 7,
    watermark: false,
    highlight: false,
    sortOrder: 2,
  },
  {
    code: "week",
    name: "Weekly Unlimited",
    tagline: "Best for busy weeks",
    type: "subscription",
    price: 499,
    downloadLimit: null,
    validityHours: 7 * 24,
    shareLinkDays: 30,
    watermark: false,
    highlight: true,
    sortOrder: 3,
  },
  {
    code: "month",
    name: "Monthly Unlimited",
    tagline: "For shops, schools and teams",
    type: "subscription",
    price: 1499,
    downloadLimit: null,
    validityHours: 30 * 24,
    shareLinkDays: 90,
    watermark: false,
    highlight: false,
    sortOrder: 4,
  },
];

async function seedPlans() {
  for (const plan of DEFAULT_PLANS) {
    const existing = await prisma.plan.findUnique({ where: { code: plan.code } });
    if (!existing) {
      await prisma.plan.create({ data: plan });
      console.log(`  plan created: ${plan.name} (₹${plan.price})`);
    }
  }
}

function checkAdminPassword(): string {
  const password = env.adminPassword;
  if (password.length < 8) throw new Error("Set ADMIN_PASSWORD (at least 8 characters) in .env first.");
  if (env.isProd && password.startsWith("change-me")) {
    throw new Error("Choose a real ADMIN_PASSWORD in .env before seeding production.");
  }
  return password;
}

async function seedAdmin() {
  if ((await prisma.admin.count()) > 0) return;
  const password = checkAdminPassword();
  await prisma.admin.create({
    data: { username: env.adminUsername, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
  });
  console.log(`  admin created: ${env.adminUsername}`);
}

async function resetAdminPassword() {
  const password = checkAdminPassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.admin.upsert({
    where: { username: env.adminUsername },
    create: { username: env.adminUsername, passwordHash },
    update: { passwordHash, tokenVersion: { increment: 1 } },
  });
  console.log(`Password for admin "${env.adminUsername}" set from ADMIN_PASSWORD.`);
}

// ---- Demo flipbook -------------------------------------------------------------

const W = 1000;
const H = 1300;
const FONT = "Inter, 'Segoe UI', 'DejaVu Sans', Arial, Helvetica, sans-serif";
const c = colors;
const SHAPES = [c.logo.orange, c.logo.red, c.logo.blue, c.logo.green];

function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if ((line + " " + word).trim().length > maxChars) {
      lines.push(line.trim());
      line = word;
    } else {
      line += " " + word;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function textBlock(lines: string[], x: number, y: number, size: number, lineHeight: number, attrs: string) {
  return lines
    .map((l, i) => `<text x="${x}" y="${y + i * lineHeight}" font-size="${size}" ${attrs}>${escapeHtml(l)}</text>`)
    .join("");
}

function illustration(kind: number, color: string): string {
  const other = SHAPES[(kind + 2) % 4];
  const third = SHAPES[(kind + 1) % 4];
  switch (kind % 6) {
    case 0: // pages turning
      return `<rect x="220" y="560" width="270" height="360" rx="14" fill="${c.ink[100]}"/>
<rect x="510" y="560" width="270" height="360" rx="14" fill="${c.ink[100]}"/>
<path d="M510 560 C 640 560 760 600 780 760 L 780 920 L 510 920 Z" fill="${color}" fill-opacity=".9"/>
<path d="M780 760 C 700 760 640 820 620 920 L 780 920 Z" fill="${other}" fill-opacity=".9"/>
${[600, 640, 680, 720].map((y) => `<rect x="250" y="${y}" width="${200 - (y % 3) * 20}" height="14" rx="7" fill="${c.ink[300]}"/>`).join("")}`;
    case 1: // share link
      return `<rect x="300" y="540" width="400" height="420" rx="44" fill="${c.ink[900]}"/>
<rect x="322" y="580" width="356" height="340" rx="20" fill="#fff"/>
<rect x="350" y="610" width="230" height="56" rx="18" fill="${c.whatsapp[500]}" fill-opacity=".2"/>
<rect x="420" y="690" width="230" height="150" rx="18" fill="${color}" fill-opacity=".9"/>
<rect x="440" y="710" width="80" height="110" rx="6" fill="#fff"/>
<rect x="350" y="860" width="180" height="40" rx="14" fill="${c.ink[100]}"/>`;
    case 2: // phone
      return `<rect x="350" y="520" width="300" height="460" rx="40" fill="${c.ink[900]}"/>
<rect x="370" y="560" width="260" height="380" rx="18" fill="#fff"/>
<rect x="395" y="590" width="210" height="280" rx="10" fill="${color}" fill-opacity=".85"/>
<circle cx="500" cy="730" r="64" fill="#fff" fill-opacity=".9"/>
<path d="M480 700 L530 730 L480 760 Z" fill="${color}"/>
<rect x="420" y="895" width="160" height="12" rx="6" fill="${c.ink[200]}"/>`;
    case 3: // single file
      return `<path d="M360 520 H580 L660 600 V960 H360 Z" fill="${c.ink[100]}" stroke="${c.ink[300]}" stroke-width="6"/>
<path d="M580 520 V600 H660" fill="none" stroke="${c.ink[300]}" stroke-width="6"/>
<rect x="400" y="660" width="220" height="64" rx="16" fill="${color}"/>
<text x="510" y="704" text-anchor="middle" font-size="34" font-weight="800" fill="#fff" font-family="${FONT}">.html</text>
${[770, 810, 850, 890].map((y) => `<rect x="400" y="${y}" width="${220 - (y % 4) * 15}" height="14" rx="7" fill="${c.ink[300]}"/>`).join("")}`;
    case 4: // privacy
      return `<circle cx="500" cy="740" r="210" fill="${color}" fill-opacity=".12"/>
<rect x="400" y="700" width="200" height="170" rx="24" fill="${color}"/>
<path d="M440 700 V650 a60 60 0 0 1 120 0 V700" fill="none" stroke="${color}" stroke-width="26"/>
<circle cx="500" cy="775" r="20" fill="#fff"/><rect x="492" y="780" width="16" height="50" rx="8" fill="#fff"/>`;
    default: // prices
      return `${[0, 1, 2].map((i) => `<rect x="${230 + i * 190}" y="${600 - i * 30}" width="160" height="${300 + i * 30}" rx="22" fill="${SHAPES[(kind + i) % 4]}" fill-opacity="${0.75 + i * 0.1}"/>`).join("")}
<text x="500" y="980" text-anchor="middle" font-size="44" font-weight="800" fill="${third}" font-family="${FONT}">₹</text>`;
  }
}

function featurePage(index: number, heading: string, body: string): string {
  const color = SHAPES[index % 4];
  const headingLines = wrap(heading, 20);
  const bodyTop = 260 + headingLines.length * 84 + 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#ffffff"/>
<rect width="${W}" height="16" fill="${color}"/>
<circle cx="${W - 60}" cy="120" r="150" fill="${color}" fill-opacity=".08"/>
<text x="90" y="170" font-family="${FONT}" font-size="26" font-weight="700" fill="${color}" letter-spacing="3">${String(index).padStart(2, "0")}</text>
${textBlock(headingLines, 90, 260, 72, 84, `font-family="${FONT}" font-weight="800" fill="${c.ink[900]}"`)}
${textBlock(wrap(body, 44), 92, bodyTop, 32, 46, `font-family="${FONT}" fill="${c.ink[600]}"`)}
<g transform="translate(0 130)">${illustration(index - 1, color)}</g>
<text x="90" y="${H - 70}" font-family="${FONT}" font-size="22" fill="${c.ink[400]}">${escapeHtml(brandName)} sample flipbook</text>
<text x="${W - 90}" y="${H - 70}" text-anchor="end" font-family="${FONT}" font-size="22" fill="${c.ink[400]}">${index + 1}</text>
</svg>`;
}

function coverPage(logo: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.brand[50]}"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<circle cx="80" cy="1220" r="260" fill="${c.logo.orange}" fill-opacity=".10"/>
<circle cx="950" cy="80" r="200" fill="${c.logo.blue}" fill-opacity=".08"/>
<image href="${logo}" x="330" y="220" width="340" height="360"/>
<text x="500" y="760" text-anchor="middle" font-family="${FONT}" font-size="104" font-weight="800" fill="${c.ink[900]}">${escapeHtml(brandName)}</text>
<text x="500" y="840" text-anchor="middle" font-family="${FONT}" font-size="38" fill="${c.ink[600]}">Your PDF, now a page-turning flipbook</text>
<rect x="350" y="930" width="300" height="76" rx="38" fill="${c.brand[600]}"/>
<text x="500" y="980" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="700" fill="#fff">Turn the page →</text>
</svg>`;
}

function backCover(logo: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="${c.ink[900]}"/>
<circle cx="900" cy="1200" r="300" fill="${c.logo.blue}" fill-opacity=".25"/>
<circle cx="120" cy="140" r="180" fill="${c.logo.orange}" fill-opacity=".18"/>
<rect x="380" y="330" width="240" height="250" rx="40" fill="#fff"/>
<image href="${logo}" x="410" y="355" width="180" height="200"/>
<text x="500" y="720" text-anchor="middle" font-family="${FONT}" font-size="74" font-weight="800" fill="#fff">Make yours</text>
<text x="500" y="805" text-anchor="middle" font-family="${FONT}" font-size="74" font-weight="800" fill="#fff">in a minute</text>
<text x="500" y="900" text-anchor="middle" font-family="${FONT}" font-size="34" fill="${c.ink[300]}">Upload a PDF. Share a link. Done.</text>
<text x="500" y="1060" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="700" fill="${c.accent[300]}">${escapeHtml(new URL(env.publicUrl).host)}</text>
</svg>`;
}

const FEATURES: [string, string][] = [
  ["Turn pages like paper", "Soft page curls, shadows and a gentle paper sound. Drag a corner, tap the arrows or use your keyboard."],
  ["Share one link", "Send your flipbook on WhatsApp. The link shows a preview card with your cover, so people tap it."],
  ["Made for phones", "Swipe through pages, zoom in to read small print and go full screen on any phone."],
  ["One file, works offline", "Download your flipbook as a single HTML file. Open it anywhere, even without internet."],
  ["Your PDF stays yours", "Pages are made in your browser. Add a Download PDF button if you want readers to have the file."],
  ["Simple prices in rupees", "Start free. Remove the watermark from ₹99, or pick a pass for unlimited downloads."],
];

async function seedDemo() {
  if (await prisma.flipbook.findUnique({ where: { slug: "demo" } })) return;
  const settings = await getSettings();
  const logoSvg = await readFile(env.brandLogoPath).catch(() => null);
  const logo = logoSvg ? `data:image/svg+xml;base64,${logoSvg.toString("base64")}` : "";
  const svgs = [
    coverPage(logo),
    ...FEATURES.map(([h, b], i) => featurePage(i + 1, h, b)),
    backCover(logo),
  ];
  const id = flipbookId();
  const dir = flipbookDir(id);
  await mkdir(dir, { recursive: true });
  const pages: StoredPage[] = [];
  for (const svg of svgs) {
    const clean = randomFileName("webp");
    const marked = randomFileName("webp");
    await svgToWebp(svg, join(dir, clean));
    await writeWatermarked(join(dir, clean), join(dir, marked), { width: W, height: H }, settings.watermarkText);
    pages.push({ clean, marked, w: W, h: H });
  }
  const ogFile = randomFileName("jpg");
  const ogMarkedFile = randomFileName("jpg");
  await writeOgImage(join(dir, pages[0].clean), join(dir, ogFile));
  await writeOgImage(join(dir, pages[0].marked), join(dir, ogMarkedFile));
  await prisma.flipbook.create({
    data: {
      id,
      slug: "demo",
      title: `${brandName} sample flipbook`,
      showCover: true,
      pdfDownload: false,
      pageCount: pages.length,
      pageWidth: W,
      pageHeight: H,
      pages: JSON.stringify(pages),
      ogFile,
      ogMarkedFile,
      watermarked: false,
      linkExpiresAt: new Date("2099-12-31T00:00:00Z"),
    },
  });
  console.log(`  demo flipbook created: /v/demo (${pages.length} pages)`);
}

export async function seedAll(opts: { demo?: boolean } = {}) {
  await seedPlans();
  await ensureSettings();
  await seedAdmin();
  if (opts.demo !== false) await seedDemo();
}

async function main() {
  if (process.argv.includes("--reset-admin-password")) {
    await resetAdminPassword();
    return;
  }
  console.log("Seeding database...");
  await seedAll();
  console.log("Done.");
}

// Run only when executed directly (npm run db:seed), not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
