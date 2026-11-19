// Text of the WhatsApp messages. Customers get these from the admin (who
// taps "Send on WhatsApp"); the request message goes from customer to admin.

import { brandName } from "../../../shared/theme";
import { describeDownloads, formatINR } from "../../../shared/format";
import { formatDateTime } from "./time";
import { env } from "../env";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export function requestMessage(r: {
  kind: string;
  planName: string;
  price: number;
  code: string;
  name: string;
  flipbookTitle?: string | null;
}): string {
  const what =
    r.kind === "instant"
      ? `an instant download (${formatINR(r.price)}) of my flipbook "${r.flipbookTitle ?? ""}"`
      : r.kind === "renewal"
        ? `to renew my account with the ${r.planName} plan (${formatINR(r.price)})`
        : `the ${r.planName} plan (${formatINR(r.price)})`;
  return [
    `Hi ${brandName}, I would like ${what}.`,
    `Reference: ${r.code}`,
    `Name: ${r.name}`,
    "Please send me the UPI QR code to pay.",
  ].join("\n");
}

export function loginMessage(c: {
  name: string;
  username: string;
  password: string;
  planName: string;
  expiresAt: Date;
  downloadsAllowed: number | null;
}): string {
  return [
    `Hi ${firstName(c.name)}, thank you for your payment! Your ${brandName} account is ready.`,
    "",
    `Log in: ${env.publicUrl}/login`,
    `Username: ${c.username}`,
    `Password: ${c.password}`,
    "",
    `Plan: ${c.planName} (${describeDownloads(c.downloadsAllowed).toLowerCase()})`,
    `Valid until: ${formatDateTime(c.expiresAt)}`,
    "",
    "Please keep these details private.",
  ].join("\n");
}

export function renewalMessage(c: {
  name: string;
  username: string;
  planName: string;
  expiresAt: Date;
  downloadsAllowed: number | null;
}): string {
  return [
    `Hi ${firstName(c.name)}, thank you for your payment! Your ${brandName} plan is active.`,
    "",
    `Plan: ${c.planName} (${describeDownloads(c.downloadsAllowed).toLowerCase()})`,
    `Valid until: ${formatDateTime(c.expiresAt)}`,
    `Log in with your username "${c.username}": ${env.publicUrl}/login`,
  ].join("\n");
}

export function instantMessage(c: {
  name: string;
  title: string;
  link: string;
  expiresAt: Date;
  shareUrl: string;
}): string {
  return [
    `Hi ${firstName(c.name)}, thank you for your payment!`,
    "",
    `Download "${c.title}" without watermark:`,
    c.link,
    "",
    `This link works once and expires on ${formatDateTime(c.expiresAt)}.`,
    `Your share link (no watermark): ${c.shareUrl}`,
  ].join("\n");
}

export function resetPasswordMessage(c: { name: string; username: string; password: string }): string {
  return [
    `Hi ${firstName(c.name)}, your ${brandName} password has been reset.`,
    "",
    `Log in: ${env.publicUrl}/login`,
    `Username: ${c.username}`,
    `New password: ${c.password}`,
  ].join("\n");
}

export function rejectMessage(c: { name: string; code: string; reason: string }): string {
  return [
    `Hi ${firstName(c.name)}, about your ${brandName} request ${c.code}:`,
    c.reason,
    "",
    "Reply here if you have any questions.",
  ].join("\n");
}
