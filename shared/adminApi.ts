// Shapes of the admin panel's JSON.
import type { CustomerInfo, FlipbookSummary, RequestKind, RequestStatus } from "./api";

export type AdminPlan = {
  id: number;
  code: string;
  name: string;
  tagline: string;
  type: "subscription" | "instant";
  price: number;
  downloadLimit: number | null;
  validityHours: number;
  shareLinkDays: number;
  watermark: boolean;
  highlight: boolean;
  active: boolean;
  sortOrder: number;
};

export type AdminRequestRow = {
  id: number;
  code: string;
  kind: RequestKind;
  status: RequestStatus;
  planName: string;
  price: number;
  name: string;
  whatsapp: string;
  createdAt: string;
  decidedAt: string | null;
};

export type AdminRequestDetail = {
  request: AdminRequestRow & {
    planId: number;
    email: string | null;
    paymentMethod: string;
    paymentRef: string | null;
    note: string | null;
    rejectReason: string | null;
    decidedBy: string | null;
    ip: string | null;
  };
  customer: CustomerInfo | null;
  matchingCustomers: CustomerInfo[];
  flipbook: FlipbookSummary | null;
  instantTokens: {
    id: number;
    status: string;
    expiresAt: string;
    usedAt: string | null;
    link: string | null;
  }[];
  plans: AdminPlan[];
  chatUrl: string;
};

export type ApproveResult = {
  kind: RequestKind;
  customer: CustomerInfo | null;
  credentials: { username: string; password: string } | null;
  instantLink: string | null;
  instantExpiresAt: string | null;
  message: string;
  whatsappUrl: string;
};

export type AdminCustomerRow = CustomerInfo & {
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  flipbookCount: number;
};

export type AdminCustomerDetail = {
  customer: AdminCustomerRow;
  flipbooks: FlipbookSummary[];
  requests: AdminRequestRow[];
  chatUrl: string;
};

export type AdminFlipbookRow = FlipbookSummary & {
  filesDeleted: boolean;
  owner: { type: "customer"; id: number; username: string } | { type: "anonymous" };
};

export type AdminStats = {
  pendingRequests: number;
  activeCustomers: number;
  downloadsToday: number;
  flipbooksCreated: number;
  flipbooksToday: number;
  revenueThisMonth: number;
  approvedThisMonth: number;
  recentPending: AdminRequestRow[];
};

export type AuditRow = {
  id: number;
  actor: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
};

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };
