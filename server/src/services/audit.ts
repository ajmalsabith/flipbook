import { prisma, type Tx } from "../db";

export type AuditActor = { adminId: string | null; name: string; ip?: string | null };

/** Records who did what in the admin panel. */
export async function audit(
  actor: AuditActor,
  action: string,
  target?: { type: string; id: string } | null,
  details?: Record<string, unknown> | null,
  tx: Tx | typeof prisma = prisma
): Promise<void> {
  await tx.auditLog.create({
    data: {
      adminId: actor.adminId,
      actor: actor.name,
      action,
      targetType: target?.type ?? null,
      targetId: target ? String(target.id) : null,
      details: details ? JSON.stringify(details) : null,
      ip: actor.ip ?? null,
    },
  });
}
