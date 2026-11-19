export const TIME_ZONE = "Asia/Kolkata";

/** 1499 -> "₹1,499" */
export function formatINR(rupees: number): string {
  return `₹${rupees.toLocaleString("en-IN")}`;
}

/** 24 -> "24 hours", 168 -> "7 days", 720 -> "30 days" */
export function describeHours(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "1 day" : `${days} days`;
  }
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export function describeDays(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

export function describeDownloads(limit: number | null): string {
  if (limit === null) return "Unlimited downloads";
  return limit === 1 ? "1 download" : `${limit} downloads`;
}

/** "26 Nov 2026, 3:05 pm" in Indian time. */
export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/** "26 Nov 2026" in Indian time. */
export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
