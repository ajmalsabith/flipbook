import { PrismaClient } from "@prisma/client";
import { env } from "./env";

export const prisma = new PrismaClient({ datasourceUrl: env.databaseUrl });

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** WAL lets the backup script read while the app writes. */
export async function prepareDatabase(): Promise<void> {
  if (!env.databaseUrl.startsWith("file:")) return;
  await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
  await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000;");
}
