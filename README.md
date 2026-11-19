# amflipbook

Turn any PDF into a page-turning flipbook. Share one link (with a WhatsApp
preview card) or download a single offline HTML file. Payments are taken
manually over WhatsApp + UPI and approved in an admin panel.

Live site: <https://amflipbook.amcloth.com>

- **One Node.js process** serves the API (`/api/*`), the React app, share links
  (`/v/<slug>`), one-time downloads (`/d/<token>`) and uploaded files.
- **One MongoDB database** (Atlas) through Prisma. Uploaded page images stay
  on the server's disk in `uploads/`.
- **No payment gateway**, no email, no queues. The payment code is structured so
  a gateway such as Razorpay can be added later (see [Payments](#payments)).

---

## Contents

- [Project layout](#project-layout)
- [Run it locally](#run-it-locally)
- [Scripts](#scripts)
- [Environment variables](#environment-variables)
- [Everyday changes](#everyday-changes) – WhatsApp number, prices, logo, colours
- [How the business rules work](#how-the-business-rules-work)
- [Payments](#payments)
- [Deploy to amflipbook.amcloth.com](#deploy-to-amflipbookamclothcom)
- [Backups](#backups)
- [Tests](#tests)
- [Troubleshooting](#troubleshooting)

---

## Project layout

```
.
├── shared/                 Code used by both server and web
│   ├── theme.ts            ← ALL brand colours, brand name and logo URL
│   ├── flipbook/           The flipbook viewer (page-flip 2.0.7) and HTML builder
│   ├── api.ts, adminApi.ts JSON types shared by server and web
│   └── phone.ts, format.ts WhatsApp numbers, ₹ and date formatting (Indian time)
├── server/                 Express + Prisma (TypeScript, bundled with tsup)
│   ├── prisma/             schema.prisma (MongoDB collections and indexes)
│   ├── src/routes/         public, flipbooks, requests, admin, pages (/v, /d)
│   ├── src/services/       entitlement rules, downloads, requests, images (sharp)…
│   ├── src/payments/       payment providers (WhatsApp manual today)
│   ├── src/cron.ts         daily clean-up job
│   ├── src/seed.ts         default plans, settings, admin, demo flipbook
│   └── test/               entitlement unit tests + end-to-end API tests
├── web/                    React 18 + Vite + Tailwind + React Router
│   ├── public/brand/logo.svg   ← your logo
│   └── src/maker/          PDF → page images in the browser (pdf.js)
├── deploy/                 PM2 and Nginx config
└── scripts/backup.mjs      nightly MongoDB (mongodump) + uploads backup
```

The flipbook viewer and PDF converter are ported from the Hightemp flipbook
maker and keep all its fixes: every page (covers too) turns as "soft" paper, a
lone cover is centred and the book slides while turning, the closing-turn fold
clip and shadow fix, the Web Audio page-turn sound with a remembered mute
button, zoom and pan, page slider, keyboard control, spine shading, page stack
and phone layout. New: pages load lazily near the one being read, an optional
"Made with amflipbook" badge, and a watermark overlay for free previews.
`page-flip` is pinned to exactly **2.0.7**.

---

## Run it locally

Requirements: **Node.js 20.19+** (22 LTS recommended) and npm.

```bash
npm install                 # installs both apps and generates the Prisma client
cp .env.example .env        # then edit .env (see below)
npm run db:migrate          # creates the MongoDB collections and indexes
npm run db:seed             # plans, settings, admin user, demo flipbook
npm run dev                 # server on :4000, website on :5173
```

Open <http://localhost:5173>. The admin panel is at
<http://localhost:5173/admin> (user and password from `ADMIN_USERNAME` /
`ADMIN_PASSWORD` in `.env`).

In development Vite serves the React app and forwards `/api`, `/v/*` and `/d/*`
to the Node server. To try the production build locally:

```bash
npm run build
npm start                   # everything on http://localhost:4000
```

(For local production testing set `PUBLIC_URL=http://localhost:4000` so share
links point to the right place.)

---

## Scripts

Run from the repository root.

| Script | What it does |
| --- | --- |
| `npm run dev` | Server (auto-restart) and website (hot reload) together |
| `npm run build` | Builds the website (`web/dist`) and the server (`server/dist`) |
| `npm start` | Production: one process serving API, website, share links and files |
| `npm run db:migrate` | Creates/updates the MongoDB collections and indexes from `schema.prisma` (`prisma db push`; safe to run on every deploy) |
| `npm run db:seed` | Adds default plans, settings, the first admin and the demo flipbook. Never overwrites your edits |
| `npm run admin:reset-password` | Sets the admin password to `ADMIN_PASSWORD` from `.env` |
| `npm test` | Entitlement unit tests and end-to-end API tests (uses a separate test database) |
| `npm run typecheck` | TypeScript check of server and web |
| `npm run backup` | Database snapshot + uploads archive into `BACKUP_DIR` |

---

## Environment variables

All live in the root `.env` (copy from `.env.example`). **Never commit `.env`.**

| Variable | Example | Meaning |
| --- | --- | --- |
| `PORT` | `4000` | Port Node listens on |
| `PUBLIC_URL` | `https://amflipbook.amcloth.com` | Public address, used in share links, WhatsApp messages and preview tags. No trailing slash |
| `TRUST_PROXY` | `1` | Proxies in front of Node (Nginx = 1). Needed for real visitor IPs |
| `JWT_SECRET` | random 48+ chars | Signs login sessions. Required in production |
| `COOKIE_SECRET` | random 48+ chars | Signs the visitor cookie. Required in production |
| `DATABASE_URL` | `mongodb+srv://USER:PASSWORD@cluster.mongodb.net/amflipbook?retryWrites=true&w=majority` | MongoDB connection string. The database name in it (`amflipbook`) is the one used. Secret |
| `UPLOAD_DIR` | `./uploads` | Page images, PDFs and preview cards |
| `BACKUP_DIR` | `./backups` | Where `npm run backup` writes |
| `BACKUP_KEEP` | `14` | Number of backups to keep |
| `ADMIN_USERNAME` | `admin` | First admin, created by the seed |
| `ADMIN_PASSWORD` | strong password | First admin's password (seed / reset only) |
| `ADMIN_WHATSAPP` | `919876543210` | Initial admin WhatsApp number (seed only, then edit in Settings) |
| `BRAND_LOGO_PATH` | `./web/public/brand/logo.svg` | Logo drawn in the corner of watermarked pages |

Make a secret with:
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

---

## Everyday changes

### WhatsApp number
Admin → **Settings** → *Admin WhatsApp number*. Digits only with country code,
e.g. `919876543210`. It takes effect immediately (customers' "Continue on
WhatsApp" buttons and the footer link). `ADMIN_WHATSAPP` in `.env` is only the
starting value used by the seed.

### Prices and plans
Admin → **Plans**: price, downloads (number or unlimited), validity, share-link
days, watermark, "Most popular" badge, active/hidden and order. Changes show on
the pricing page at once. Customers who already paid keep the terms they
bought. Free-plan limits (downloads per visitor, per-IP daily cap, free link
hours) and upload limits are in Admin → **Settings**.

### Logo
Replace `web/public/brand/logo.svg` with your file (keep the name), then
restart the server so watermarks use it. If you only have a PNG:
1. save it as `web/public/brand/logo.png`,
2. set `brandLogoUrl = "/brand/logo.png"` in `shared/theme.ts`,
3. set `BRAND_LOGO_PATH=./web/public/brand/logo.png` in `.env`,
4. change the two icon lines in `web/index.html`,
5. `npm run build` and restart.

The demo flipbook on the home page has the logo baked into its pages. To
redraw it: Admin → Flipbooks → delete "amflipbook sample flipbook", then
`npm run db:seed`.

### Colours and brand name
Everything is in **`shared/theme.ts`**: `brand` (main blue; `600` is the button
colour), `accent` (orange highlights), `logo` (the four logo colours), `ink`
(greys). The website, the flipbook viewer, the expired/download pages and the
preview cards all read from it. Rebuild after changing.

---

## How the business rules work

All limits are enforced on the server (`server/src/services/entitlement.ts`).

| | Free (no login) | Instant ₹99 | 1-Day ₹199 | Weekly ₹499 | Monthly ₹1,499 |
| --- | --- | --- | --- | --- | --- |
| Downloads | 5 per visitor | 1 (one flipbook) | 5 | Unlimited | Unlimited |
| Validity | – | link 48 h | 24 h | 7 days | 30 days |
| Watermark | yes + badge | no | no | no | no |
| Share link | 1 day | 7 days | 7 days | 30 days | 90 days |

- **Visitors** are identified by a signed, httpOnly cookie. Free downloads are
  counted per visitor, plus a soft per-IP daily cap (Settings).
- **Uploads**: the PDF is turned into WebP pages in the browser. The server
  checks every page with sharp (real image, size, not animated), the page count
  and PDF size against Settings, then stores a clean and a watermarked copy of
  each page under `uploads/<flipbookId>/` with random names, plus 1200×630
  preview cards.
- **Downloads** are built by the server: the single HTML file embeds the clean
  or watermarked pages depending on what the visitor or customer is entitled
  to. The allowance check and the download count happen in one transaction.
- **Share links** `/v/<slug>` use the same viewer, load pages lazily, count
  views (link-preview bots excluded) and include Open Graph / Twitter tags so
  WhatsApp shows the cover. Watermarked flipbooks never serve their clean
  images. After expiry the link shows "This flipbook link has expired".
- **Logging in** moves the flipbooks this browser made before paying into the
  account and gives them the plan's terms (no watermark, longer link).
- **Renewal** extends the same account; time left on a running plan is added.
- **Expired plans**: the customer can log in and sees "Your plan has expired"
  with "Choose a new plan"; downloads are paused.
- **One-time links** `/d/<token>`: opening the link only shows a button (so a
  WhatsApp link preview can't use it up); the download works once, within the
  plan's validity (48 h). The admin can issue a new link.
- **Daily job** (03:15 IST, and shortly after start-up): marks expired plans,
  deletes files of anonymous flipbooks 2 days after their link expired, expires
  unused one-time links, clears interrupted uploads.

### The admin workflow
1. A customer chooses a plan and gets a reference code like `AMF-7K3Q`, then
   taps **Continue on WhatsApp** (message prefilled with plan, price and code).
2. You reply with your UPI QR code; they send the payment screenshot.
3. Admin → **Requests** → open the code → enter the UTR → **Approve**.
   - New customer: a username and strong password are generated and shown
     **once**, with **Send on WhatsApp** (login message prefilled).
   - Renewal: the same account is extended; send the confirmation.
   - Instant ₹99: a one-time download link is created; send it.
4. Or **Reject** with a reason (and tell them on WhatsApp).

Every admin action is recorded in Admin → **Activity log**.

---

## Payments

Today the only provider is `whatsapp_manual` (`server/src/payments/index.ts`).
To add a gateway such as Razorpay later:

1. Add a provider whose `checkout()` creates a gateway order and returns what
   the website needs to open the gateway's checkout.
2. Add a webhook route that verifies the gateway signature and calls
   `fulfilRequest()` from `server/src/services/requests.ts` with the payment id
   as `paymentRef` – the same function the admin **Approve** button uses.
3. Store the provider id in `Request.paymentMethod`.

---

## Deploy to amflipbook.amcloth.com

Target: **Ubuntu 22.04/24.04**, Nginx, PM2, Let's Encrypt.

### 1. DNS
Create an `A` record `amflipbook.amcloth.com` → your server's IP.

### 2. Server packages
```bash
sudo apt update
sudo apt install -y nginx git fonts-dejavu-core   # fonts for watermark text
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 3. Get the code and configure
```bash
sudo mkdir -p /var/www/amflipbook && sudo chown $USER /var/www/amflipbook
git clone <your-repo-url> /var/www/amflipbook
cd /var/www/amflipbook
cp .env.example .env
nano .env
```
In `.env` set at least:
```
PUBLIC_URL=https://amflipbook.amcloth.com
DATABASE_URL=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/amflipbook?retryWrites=true&w=majority
JWT_SECRET=<random>
COOKIE_SECRET=<random>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong password>
ADMIN_WHATSAPP=91XXXXXXXXXX
```
Then `chmod 600 .env` (it holds the database password).

In MongoDB Atlas → **Network Access**, add the server's public IP, or the
app cannot connect.

### 4. Build and start
```bash
npm ci
npm run build
npm run db:migrate
npm run db:seed
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup          # run the command it prints, so the app starts on boot
```
Check: `curl http://127.0.0.1:4000/api/health` → `{"ok":true}`.

### 5. Nginx and HTTPS
```bash
sudo cp deploy/nginx-amflipbook.conf /etc/nginx/sites-available/amflipbook
sudo ln -s /etc/nginx/sites-available/amflipbook /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d amflipbook.amcloth.com --redirect
```
Certbot renews the certificate automatically.

### 6. Updating later
```bash
cd /var/www/amflipbook
git pull
npm ci
npm run build
npm run db:migrate
pm2 reload amflipbook
```

Keep **one** PM2 instance (the in-memory rate limits and the daily job expect
a single process).

---

## Backups

`npm run backup` writes `BACKUP_DIR/<date-time>/database.archive.gz` (a
`mongodump` of the database, safe while the app runs) and `uploads.tar.gz`,
and keeps the newest `BACKUP_KEEP` backups. It needs MongoDB Database Tools
on the server: download the Ubuntu `.deb` matching your Ubuntu version from
<https://www.mongodb.com/try/download/database-tools>, then
```bash
sudo apt install -y ./mongodb-database-tools-*.deb
```
Paid Atlas tiers also keep their own cloud backups; this script covers the
uploads too, which Atlas never sees.

Nightly at 02:30 (`crontab -e`):
```
30 2 * * * cd /var/www/amflipbook && /usr/bin/node scripts/backup.mjs >> /var/log/amflipbook-backup.log 2>&1
```
Copy `backups/` off the server regularly (e.g. `rclone` to Google Drive or S3).

**Restore:** `pm2 stop amflipbook`, then
`mongorestore --uri="<DATABASE_URL>" --archive=database.archive.gz --gzip --drop --nsInclude="amflipbook.*"`,
extract `uploads.tar.gz` into the repo root, `pm2 start amflipbook`.

---

## Tests

```bash
npm test
```

By default the tests start a throwaway local MongoDB (the first run downloads
it). To use a separate database on Atlas instead, set `TEST_DATABASE_URL` to
the same connection string with the database name `amflipbook_test` (the name
must end in `_test`: it is emptied on every run). Never point it at the live
database.

- `server/test/entitlement.test.ts` – the rules: free limit, per-IP cap,
  1-Day Pass limit, unlimited plans, expiry, renewal time, instant single-use
  link, share-link expiry.
- `server/test/flows.test.ts` – the whole journey through the real API and a
  throwaway MongoDB database: watermarked free downloads → limit (also with
  simultaneous clicks) → WhatsApp
  request → admin approval → login → clean downloads → plan limit → expiry →
  renewal → instant one-time link (works once) → share-link expiry → clean-up
  job → cross-site request blocking.

---

## Troubleshooting

- **`EPERM ... query_engine-windows.dll.node` during `npm install` or
  `npm run build` on Windows** – a running server has the Prisma engine open.
  Stop `npm run dev` / `npm start` and run it again.
- **Watermark text missing on Linux** – install fonts:
  `sudo apt install fonts-dejavu-core`, then restart.
- **Forgot the admin password** – put a new one in `ADMIN_PASSWORD` and run
  `npm run admin:reset-password`.
- **Share links point to localhost** – `PUBLIC_URL` in `.env` is wrong; fix it
  and `pm2 reload amflipbook`.
- **WhatsApp preview not showing** – WhatsApp caches previews per URL; test
  with a new flipbook. The site must be reachable over HTTPS.

- **App does not start / "Server selection timeout"** – the server's IP is
  not in Atlas → Network Access, or `DATABASE_URL` is wrong.
- **Changed `schema.prisma`** – run `npm run db:migrate` (adds new indexes and
  collections; MongoDB needs no migration files).
