// Shapes of the JSON exchanged between the server and the web app.

export type PlanType = "subscription" | "instant";

export type PublicPlan = {
  id: string;
  code: string;
  name: string;
  tagline: string;
  type: PlanType;
  price: number;
  /** null = unlimited */
  downloadLimit: number | null;
  validityHours: number;
  shareLinkDays: number;
  watermark: boolean;
  highlight: boolean;
};

export type PublicConfig = {
  brandName: string;
  publicUrl: string;
  whatsappNumber: string;
  freeDownloadLimit: number;
  freeLinkHours: number;
  maxPdfMb: number;
  maxPages: number;
  watermarkText: string;
};

export type PlanStatus = "active" | "expired" | "none";

export type CustomerInfo = {
  id: string;
  username: string;
  name: string;
  whatsapp: string;
  email: string | null;
  planName: string | null;
  planCode: string | null;
  planStatus: PlanStatus;
  planStartsAt: string | null;
  planExpiresAt: string | null;
  /** null = unlimited */
  downloadsAllowed: number | null;
  downloadsUsed: number;
  watermark: boolean;
  shareLinkDays: number;
};

export type DenyReason =
  | "free_limit"
  | "ip_limit"
  | "plan_expired"
  | "plan_limit"
  | "no_plan"
  | "account_disabled";

export type DownloadStatus =
  | { allowed: true; watermark: boolean; remaining: number | null }
  | { allowed: false; reason: DenyReason };

export type MeResponse = {
  customer: CustomerInfo | null;
  free: { used: number; limit: number; remaining: number };
  download: DownloadStatus;
};

export type LinkStatus = "active" | "expired" | "disabled" | "deleted";

export type FlipbookSummary = {
  id: string;
  slug: string;
  title: string;
  pageCount: number;
  showCover: boolean;
  pdfDownload: boolean;
  hasPdf: boolean;
  watermarked: boolean;
  views: number;
  downloads: number;
  createdAt: string;
  linkExpiresAt: string;
  linkStatus: LinkStatus;
  shareUrl: string;
  thumbUrl: string;
};

export type RequestKind = "new" | "renewal" | "instant";
export type RequestStatus = "pending" | "approved" | "rejected";

export type RequestStatusResponse = {
  code: string;
  kind: RequestKind;
  status: RequestStatus;
  planName: string;
  price: number;
  firstName: string;
  flipbookTitle: string | null;
  createdAt: string;
  decidedAt: string | null;
  rejectReason: string | null;
  /** Only while pending */
  payment: PaymentInstructions | null;
};

/** How the customer pays. Today: WhatsApp + UPI; later possibly a gateway. */
export type PaymentInstructions = {
  method: "whatsapp_manual";
  whatsappUrl: string;
  steps: string[];
};

export type ApiErrorBody = {
  error: string;
  message: string;
  reason?: DenyReason;
  fields?: Record<string, string>;
};
