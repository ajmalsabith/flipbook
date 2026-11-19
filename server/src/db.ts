import { Prisma, PrismaClient } from "@prisma/client";
import { env } from "./env";

export const prisma = new PrismaClient({ datasourceUrl: env.databaseUrl });

export type Tx = Prisma.TransactionClient;

/** Connects at start-up, so a wrong DATABASE_URL fails right away. */
export async function prepareDatabase(): Promise<void> {
  await prisma.$connect();
}

/** A MongoDB ObjectId as text (24 hex characters), e.g. an id from a URL. */
export function isObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{24}$/i.test(value);
}

/**
 * "This optional field has no value". In MongoDB a field can be stored as
 * null or not stored at all, and Prisma's `{ field: null }` only matches the
 * first. Use inside `AND: [...]` when the query has its own `OR`.
 */
export function noValue<F extends string>(field: F) {
  return {
    OR: [{ [field]: null }, { [field]: { isSet: false } }] as Array<Record<F, null | { isSet: false }>>,
  };
}

/** "This optional field has a value" (the opposite of noValue). */
export function hasValue<F extends string>(field: F) {
  return { [field]: { isSet: true, not: null } } as Record<F, { isSet: true; not: null }>;
}

function isWriteConflict(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /WriteConflict|TransientTransactionError|write conflict/i.test(message);
}

/**
 * Runs an interactive transaction and retries it when MongoDB aborts it
 * because another transaction changed the same document at the same time
 * (e.g. two downloads of one flipbook). Each retry starts fresh and so sees
 * what the other transaction wrote.
 */
export async function transaction<T>(fn: (tx: Tx) => Promise<T>, attempts = 8): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { maxWait: 10_000, timeout: 20_000 });
    } catch (err) {
      if (attempt >= attempts || !isWriteConflict(err)) throw err;
      await new Promise((r) => setTimeout(r, 15 * attempt + Math.random() * 40));
    }
  }
}

/**
 * Writes the lock row for `key` inside a transaction. Two transactions that
 * lock the same key collide, so one of them is aborted and retried by
 * transaction(). Call it before reading what the lock protects.
 */
export async function lock(tx: Tx, key: string): Promise<void> {
  await tx.lock.upsert({ where: { key }, create: { key, n: 1 }, update: { n: { increment: 1 } } });
}
