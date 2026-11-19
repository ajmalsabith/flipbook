export { formatDate, formatDateTime } from "../../../shared/format";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

// India has no daylight saving: always UTC+5:30.
const IST_OFFSET_MS = 330 * 60_000;

/** Midnight (Indian time) at the start of the day containing `now`. */
export function startOfDayIST(now: Date): Date {
  const shifted = now.getTime() + IST_OFFSET_MS;
  const midnight = shifted - (shifted % DAY_MS);
  return new Date(midnight - IST_OFFSET_MS);
}

/** First day of the month (Indian time) containing `now`. */
export function startOfMonthIST(now: Date): Date {
  const local = new Date(now.getTime() + IST_OFFSET_MS);
  const first = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
  return new Date(first - IST_OFFSET_MS);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}
