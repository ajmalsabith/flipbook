// End-to-end API test of the whole customer journey against a real (test)
// MongoDB database: free downloads with watermark, the free limit, a WhatsApp
// subscription request, admin approval, customer login, clean downloads,
// plan limits, expiry and renewal, instant one-time links and share-link expiry.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { runMaintenance } from "../src/cron";
import { prisma } from "../src/db";
import { flipbookDir, flipbookFile, readPages } from "../src/services/flipbooks";
import { seedAll } from "../src/seed";

const app = createApp();

async function pageImage(color: string): Promise<Buffer> {
  return sharp({ create: { width: 420, height: 594, channels: 3, background: color } })
    .webp({ quality: 80 })
    .toBuffer();
}

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function upload(agent: request.Agent, title: string) {
  const res = await agent
    .post("/api/flipbooks")
    .field("title", title)
    .field("showCover", "true")
    .field("pdfDownload", "true")
    .attach("pages", await pageImage("#ffcc00"), { filename: "1.webp", contentType: "image/webp" })
    .attach("pages", await pageImage("#3366ff"), { filename: "2.webp", contentType: "image/webp" })
    .attach("pdf", PDF, { filename: "brochure.pdf", contentType: "application/pdf" });
  expect(res.status, res.text).toBe(201);
  return res.body as { id: string; slug: string; watermarked: boolean; linkExpiresAt: string };
}

function download(agent: request.Agent, id: string) {
  return agent.post(`/api/flipbooks/${id}/download`);
}

let admin: request.Agent;

beforeAll(async () => {
  await seedAll({ demo: false });
  admin = request.agent(app);
  const res = await admin.post("/api/admin/login").send({ username: "admin", password: "test-admin-password" });
  expect(res.status).toBe(200);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function planId(code: string) {
  return (await prisma.plan.findUniqueOrThrow({ where: { code } })).id;
}

describe("free visitor → subscribe → customer", () => {
  const visitor = request.agent(app);
  let book: { id: string; slug: string };
  let credentials: { username: string; password: string };

  it("creates a watermarked flipbook whose link lasts 1 day", async () => {
    const before = Date.now();
    const created = await upload(visitor, "Spring catalogue");
    book = created;
    expect(created.watermarked).toBe(true);
    const hoursLeft = (new Date(created.linkExpiresAt).getTime() - before) / 3_600_000;
    expect(hoursLeft).toBeGreaterThan(23.9);
    expect(hoursLeft).toBeLessThan(24.1);

    const fb = await prisma.flipbook.findUniqueOrThrow({ where: { id: created.id } });
    const pages = readPages(fb);
    expect(pages).toHaveLength(2);
    for (const p of pages) {
      expect(existsSync(flipbookFile(fb.id, p.clean))).toBe(true);
      expect(existsSync(flipbookFile(fb.id, p.marked))).toBe(true);
    }
  });

  it("rejects files that are not images", async () => {
    const res = await visitor
      .post("/api/flipbooks")
      .field("title", "Bad")
      .field("showCover", "true")
      .field("pdfDownload", "false")
      .attach("pages", Buffer.from("<script>alert(1)</script>"), { filename: "x.webp", contentType: "image/webp" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not a valid image/);
  });

  it("serves the share link with preview tags and watermarked pages", async () => {
    const page = await visitor.get(`/v/${book.slug}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('property="og:image" content="http://amflipbook.test/v/');
    expect(page.text).toContain("Made with");
    const fb = await prisma.flipbook.findUniqueOrThrow({ where: { id: book.id } });
    const marked = await readFile(flipbookFile(fb.id, readPages(fb)[0].marked));
    const img = await visitor.get(`/v/${book.slug}/p/1?v=c`).buffer(true);
    expect(img.status).toBe(200);
    expect(Buffer.compare(img.body as Buffer, marked)).toBe(0);
    const og = await visitor.get(`/v/${book.slug}/og.jpg`);
    expect(og.status).toBe(200);
    expect(og.headers["content-type"]).toBe("image/jpeg");
  });

  it("allows 5 free watermarked downloads, then refuses", async () => {
    for (let i = 0; i < 4; i++) {
      const res = await download(visitor, book.id);
      expect(res.status).toBe(200);
      expect(res.headers["x-watermarked"]).toBe("1");
      expect(res.headers["content-disposition"]).toContain("spring-catalogue.html");
      expect(res.text).toContain("Made with");
      expect(res.text).toContain("St.PageFlip");
    }
    // Several clicks at the same moment must not all get the last free slot.
    const racing = await Promise.all([1, 2, 3].map(() => download(visitor, book.id)));
    expect(racing.map((r) => r.status).sort()).toEqual([200, 403, 403]);
    const denied = await download(visitor, book.id);
    expect(denied.status).toBe(403);
    expect(denied.body.reason).toBe("free_limit");
    const me = await visitor.get("/api/me");
    expect(me.body.free).toEqual({ used: 5, limit: 5, remaining: 0 });
  });

  it("does not let another browser download or see someone else's flipbook", async () => {
    const stranger = request.agent(app);
    expect((await download(stranger, book.id)).status).toBe(404);
    expect((await stranger.get(`/api/flipbooks/${book.id}`)).status).toBe(404);
  });

  it("creates a subscription request with a WhatsApp link", async () => {
    const res = await visitor
      .post("/api/requests")
      .send({ planCode: "day", name: "Ravi Kumar", whatsapp: "98765 43210", email: "" });
    expect(res.status, res.text).toBe(201);
    expect(res.body.code).toMatch(/^AMF-[2-9A-Z]{4}$/);
    expect(res.body.status).toBe("pending");
    expect(res.body.payment.whatsappUrl).toContain("https://wa.me/919000000001?text=");
    expect(decodeURIComponent(res.body.payment.whatsappUrl)).toContain(res.body.code);

    const status = await request(app).get(`/api/requests/${res.body.code}`);
    expect(status.body.status).toBe("pending");

    const row = await prisma.request.findUniqueOrThrow({ where: { code: res.body.code } });
    expect(row.whatsapp).toBe("919876543210");
    expect(row.kind).toBe("new");

    const approved = await admin.post(`/api/admin/requests/${row.id}/approve`).send({
      planId: await planId("day"),
      paymentRef: "UTR123456",
      downloadsAllowed: 5,
      validityHours: 24,
    });
    expect(approved.status, approved.text).toBe(200);
    expect(approved.body.credentials.username).toMatch(/^ravi\d{4}$/);
    expect(approved.body.credentials.password).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    expect(approved.body.whatsappUrl).toContain("https://wa.me/919876543210?text=");
    credentials = approved.body.credentials;

    const after = await request(app).get(`/api/requests/${res.body.code}`);
    expect(after.body.status).toBe("approved");
    expect(after.body.payment).toBeNull();
    const log = await prisma.auditLog.findFirst({ where: { action: "request.approve", targetId: row.code } });
    expect(log?.actor).toBe("admin");
  });

  it("a request cannot be approved twice", async () => {
    const row = await prisma.request.findFirstOrThrow({ where: { status: "approved" } });
    const again = await admin.post(`/api/admin/requests/${row.id}/approve`).send({
      planId: await planId("day"),
      downloadsAllowed: 5,
      validityHours: 24,
    });
    expect(again.status).toBe(409);
  });

  it("the customer logs in and downloads without watermark", async () => {
    const wrong = await visitor.post("/api/auth/login").send({ username: credentials.username, password: "nope" });
    expect(wrong.status).toBe(401);
    const login = await visitor.post("/api/auth/login").send(credentials);
    expect(login.status).toBe(200);
    expect(login.body.customer.planStatus).toBe("active");
    expect(login.body.customer.downloadsAllowed).toBe(5);

    // The flipbook made before paying now belongs to the account, clean.
    const list = await visitor.get("/api/flipbooks");
    expect(list.body.map((b: { id: string }) => b.id)).toContain(book.id);
    const claimed = list.body.find((b: { id: string }) => b.id === book.id);
    expect(claimed.watermarked).toBe(false);

    const res = await download(visitor, book.id);
    expect(res.status).toBe(200);
    expect(res.headers["x-watermarked"]).toBe("0");
    expect(res.text).not.toContain("Made with");
    expect(res.headers["x-downloads-remaining"]).toBe("4");
  });

  it("1-Day Pass: 5 downloads, then plan_limit", async () => {
    for (let i = 0; i < 4; i++) expect((await download(visitor, book.id)).status).toBe(200);
    const denied = await download(visitor, book.id);
    expect(denied.status).toBe(403);
    expect(denied.body.reason).toBe("plan_limit");
  });

  it("expired plan: can log in but downloads are refused", async () => {
    const customer = await prisma.customer.findUniqueOrThrow({ where: { username: credentials.username } });
    const res = await admin
      .patch(`/api/admin/customers/${customer.id}`)
      .send({ planExpiresAt: new Date(Date.now() - 60_000).toISOString(), downloadsUsed: 0 });
    expect(res.status, res.text).toBe(200);

    const me = await visitor.get("/api/me");
    expect(me.body.customer.planStatus).toBe("expired");
    expect(me.body.download).toEqual({ allowed: false, reason: "plan_expired" });
    const denied = await download(visitor, book.id);
    expect(denied.body.reason).toBe("plan_expired");
  });

  it("renewal extends the same account with an unlimited plan", async () => {
    const req = await visitor
      .post("/api/requests")
      .send({ planCode: "week", name: "Ravi Kumar", whatsapp: "+91 98765 43210" });
    expect(req.status).toBe(201);
    expect(req.body.kind).toBe("renewal");
    const row = await prisma.request.findUniqueOrThrow({ where: { code: req.body.code } });
    const approved = await admin.post(`/api/admin/requests/${row.id}/approve`).send({
      planId: await planId("week"),
      downloadsAllowed: null,
      validityHours: 168,
    });
    expect(approved.status, approved.text).toBe(200);
    expect(approved.body.credentials).toBeNull();
    expect(approved.body.customer.username).toBe(credentials.username);
    expect(await prisma.customer.count()).toBe(1);

    for (let i = 0; i < 8; i++) {
      const res = await download(visitor, book.id);
      expect(res.status).toBe(200);
      expect(res.headers["x-downloads-remaining"]).toBe("unlimited");
    }
  });

  it("a disabled account is signed out", async () => {
    const customer = await prisma.customer.findUniqueOrThrow({ where: { username: credentials.username } });
    await admin.patch(`/api/admin/customers/${customer.id}`).send({ disabled: true });
    const me = await visitor.get("/api/me");
    expect(me.body.customer).toBeNull();
    const login = await request(app).post("/api/auth/login").send(credentials);
    expect(login.status).toBe(403);
    await admin.patch(`/api/admin/customers/${customer.id}`).send({ disabled: false });
  });
});

describe("instant download (₹99)", () => {
  const visitor = request.agent(app);

  it("gives a one-time clean download link that works once", async () => {
    const book = await upload(visitor, "Wedding album");
    const req = await visitor
      .post("/api/requests")
      .send({ planCode: "instant", name: "Asha", whatsapp: "09123456789", flipbookId: book.id });
    expect(req.status, req.text).toBe(201);
    expect(req.body.kind).toBe("instant");
    expect(req.body.flipbookTitle).toBe("Wedding album");

    const row = await prisma.request.findUniqueOrThrow({ where: { code: req.body.code } });
    const approved = await admin.post(`/api/admin/requests/${row.id}/approve`).send({
      planId: await planId("instant"),
      downloadsAllowed: null,
      validityHours: 48,
    });
    expect(approved.status, approved.text).toBe(200);
    const link = new URL(approved.body.instantLink);
    expect(link.pathname).toMatch(/^\/d\/[A-Za-z0-9_-]{30,}$/);

    // The share link is now clean and lasts 7 days.
    const fb = await prisma.flipbook.findUniqueOrThrow({ where: { id: book.id } });
    expect(fb.watermarked).toBe(false);
    expect(fb.linkExpiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);

    // Opening the link (or a WhatsApp preview fetch) does not use it up.
    const landing = await request(app).get(link.pathname);
    expect(landing.status).toBe(200);
    expect(landing.text).toContain("Download flipbook");
    expect((await request(app).get(link.pathname)).status).toBe(200);

    const first = await request(app).post(link.pathname);
    expect(first.status).toBe(200);
    expect(first.headers["content-disposition"]).toContain("wedding-album.html");
    expect(first.text).not.toContain("Made with");

    const second = await request(app).post(link.pathname);
    expect(second.status).toBe(410);
    expect(second.text).toContain("already been used");
  });

  it("an expired one-time link is refused", async () => {
    const token = await prisma.instantToken.findFirstOrThrow();
    const req = await prisma.request.findUniqueOrThrow({ where: { id: token.requestId } });
    const reissued = await admin.post(`/api/admin/requests/${req.id}/reissue`).send({ validityHours: 48 });
    expect(reissued.status).toBe(200);
    const path = new URL(reissued.body.instantLink).pathname;
    await prisma.instantToken.updateMany({
      where: { token: path.slice(3) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await request(app).post(path);
    expect(res.status).toBe(410);
    expect(res.text).toContain("expired");
  });
});

describe("share-link expiry and clean-up", () => {
  const visitor = request.agent(app);

  it("shows the expired screen after the link expires, and hides the pages", async () => {
    const book = await upload(visitor, "Menu card");
    await prisma.flipbook.update({
      where: { id: book.id },
      data: { linkExpiresAt: new Date(Date.now() - 1000) },
    });
    const page = await request(app).get(`/v/${book.slug}`);
    expect(page.status).toBe(410);
    expect(page.text).toContain("This flipbook link has expired");
    expect((await request(app).get(`/v/${book.slug}/p/1`)).status).toBe(404);
    expect((await request(app).get(`/v/${book.slug}/og.jpg`)).status).toBe(404);
    // The admin can still open it.
    expect((await admin.get(`/v/${book.slug}`)).status).toBe(200);
  });

  it("the daily job deletes anonymous files 2 days after expiry", async () => {
    const book = await upload(visitor, "Old flyer");
    await prisma.flipbook.update({
      where: { id: book.id },
      data: { linkExpiresAt: new Date(Date.now() - 3 * 86_400_000) },
    });
    const result = await runMaintenance();
    expect(result.flipbookFilesDeleted).toBeGreaterThanOrEqual(1);
    expect(existsSync(flipbookDir(book.id))).toBe(false);
    const fb = await prisma.flipbook.findUniqueOrThrow({ where: { id: book.id } });
    expect(fb.filesDeleted).toBe(true);
  });

  it("blocks cross-site form posts", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://evil.example")
      .send({ username: "x", password: "y" });
    expect(res.status).toBe(403);
    const fetchMeta = await request(app)
      .post("/api/auth/login")
      .set("Sec-Fetch-Site", "cross-site")
      .send({ username: "x", password: "y" });
    expect(fetchMeta.status).toBe(403);
  });

  it("allows same-origin form posts even when the browser sends Origin: null", async () => {
    const res = await request(app)
      .post("/d/not-a-real-token")
      .set("Origin", "null")
      .set("Sec-Fetch-Site", "same-origin")
      .type("form")
      .send("");
    expect(res.status).toBe(404);
    expect(res.text).toContain("This download link is not valid");
  });
});
