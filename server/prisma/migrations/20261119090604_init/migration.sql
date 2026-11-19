-- CreateTable
CREATE TABLE "Admin" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT,
    "planId" INTEGER,
    "planName" TEXT,
    "planStatus" TEXT NOT NULL DEFAULT 'none',
    "planStartsAt" DATETIME,
    "planExpiresAt" DATETIME,
    "downloadsAllowed" INTEGER,
    "downloadsUsed" INTEGER NOT NULL DEFAULT 0,
    "watermark" BOOLEAN NOT NULL DEFAULT false,
    "shareLinkDays" INTEGER NOT NULL DEFAULT 7,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "downloadLimit" INTEGER,
    "validityHours" INTEGER NOT NULL,
    "shareLinkDays" INTEGER NOT NULL,
    "watermark" BOOLEAN NOT NULL DEFAULT false,
    "highlight" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Request" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "planId" INTEGER NOT NULL,
    "planName" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT,
    "customerId" INTEGER,
    "flipbookId" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'whatsapp_manual',
    "paymentRef" TEXT,
    "note" TEXT,
    "rejectReason" TEXT,
    "visitorId" TEXT,
    "ip" TEXT,
    "decidedAt" DATETIME,
    "decidedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Request_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Request_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Request_flipbookId_fkey" FOREIGN KEY ("flipbookId") REFERENCES "Flipbook" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Request_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Flipbook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "showCover" BOOLEAN NOT NULL DEFAULT true,
    "pdfDownload" BOOLEAN NOT NULL DEFAULT false,
    "pageCount" INTEGER NOT NULL,
    "pageWidth" INTEGER NOT NULL,
    "pageHeight" INTEGER NOT NULL,
    "pages" TEXT NOT NULL,
    "pdfFile" TEXT,
    "pdfName" TEXT,
    "ogFile" TEXT,
    "ogMarkedFile" TEXT,
    "watermarked" BOOLEAN NOT NULL DEFAULT true,
    "customerId" INTEGER,
    "visitorId" TEXT,
    "linkExpiresAt" DATETIME NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "filesDeleted" BOOLEAN NOT NULL DEFAULT false,
    "views" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Flipbook_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DownloadEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "flipbookId" TEXT,
    "customerId" INTEGER,
    "visitorId" TEXT,
    "ip" TEXT,
    "kind" TEXT NOT NULL,
    "watermarked" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DownloadEvent_flipbookId_fkey" FOREIGN KEY ("flipbookId") REFERENCES "Flipbook" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DownloadEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InstantToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "requestId" INTEGER NOT NULL,
    "flipbookId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "usedIp" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstantToken_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InstantToken_flipbookId_fkey" FOREIGN KEY ("flipbookId") REFERENCES "Flipbook" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "adminId" INTEGER,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_username_key" ON "Customer"("username");

-- CreateIndex
CREATE INDEX "Customer_whatsapp_idx" ON "Customer"("whatsapp");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Request_code_key" ON "Request"("code");

-- CreateIndex
CREATE INDEX "Request_status_createdAt_idx" ON "Request"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Flipbook_slug_key" ON "Flipbook"("slug");

-- CreateIndex
CREATE INDEX "Flipbook_visitorId_idx" ON "Flipbook"("visitorId");

-- CreateIndex
CREATE INDEX "Flipbook_customerId_idx" ON "Flipbook"("customerId");

-- CreateIndex
CREATE INDEX "Flipbook_linkExpiresAt_idx" ON "Flipbook"("linkExpiresAt");

-- CreateIndex
CREATE INDEX "DownloadEvent_visitorId_kind_idx" ON "DownloadEvent"("visitorId", "kind");

-- CreateIndex
CREATE INDEX "DownloadEvent_ip_createdAt_idx" ON "DownloadEvent"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "DownloadEvent_createdAt_idx" ON "DownloadEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstantToken_token_key" ON "InstantToken"("token");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
