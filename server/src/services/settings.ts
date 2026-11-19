import { z } from "zod";
import { prisma, transaction } from "../db";
import { env } from "../env";

export const settingsSchema = z.object({
  /** Receives payment messages. Country code + number, digits only. */
  whatsappNumber: z.string().regex(/^[1-9]\d{7,14}$/, "Digits only, with country code, e.g. 919876543210"),
  freeDownloadLimit: z.number().int().min(0).max(1000),
  /** Soft cap per IP address per day for free downloads (0 = off). */
  freeIpDailyLimit: z.number().int().min(0).max(100000),
  freeLinkHours: z.number().int().min(1).max(24 * 365),
  maxPdfMb: z.number().int().min(1).max(500),
  maxPages: z.number().int().min(1).max(1000),
  watermarkText: z.string().trim().min(1).max(40),
});

export type Settings = z.infer<typeof settingsSchema>;

export function defaultSettings(): Settings {
  return {
    whatsappNumber: env.adminWhatsapp,
    freeDownloadLimit: 5,
    freeIpDailyLimit: 20,
    freeLinkHours: 24,
    maxPdfMb: 50,
    maxPages: 200,
    watermarkText: "amflipbook",
  };
}

let cache: Settings | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache) return cache;
  const rows = await prisma.setting.findMany();
  const merged: Record<string, unknown> = { ...defaultSettings() };
  for (const row of rows) {
    if (row.key in merged) {
      try {
        merged[row.key] = JSON.parse(row.value);
      } catch {
        // keep the default
      }
    }
  }
  const parsed = settingsSchema.safeParse(merged);
  cache = parsed.success ? parsed.data : defaultSettings();
  return cache;
}

export async function saveSettings(values: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = settingsSchema.parse({ ...current, ...values });
  await transaction(async (tx) => {
    for (const [key, value] of Object.entries(next)) {
      await tx.setting.upsert({
        where: { key },
        create: { key, value: JSON.stringify(value) },
        update: { value: JSON.stringify(value) },
      });
    }
  });
  cache = next;
  return next;
}

/** Writes defaults for settings that are not stored yet (used by the seed). */
export async function ensureSettings(): Promise<void> {
  const existing = new Set((await prisma.setting.findMany()).map((s) => s.key));
  const defaults = defaultSettings();
  for (const [key, value] of Object.entries(defaults)) {
    if (!existing.has(key)) {
      await prisma.setting.create({ data: { key, value: JSON.stringify(value) } });
    }
  }
  cache = null;
}

export function clearSettingsCache(): void {
  cache = null;
}
