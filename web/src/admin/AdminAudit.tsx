import { useState } from "react";
import type { AuditRow, Paged } from "@shared/adminApi";
import { formatDateTime } from "@shared/format";
import { Alert } from "../components/ui";
import { PageHeader, Pagination, Table, useAdmin } from "./adminUi";

function summary(details: string | null): string {
  if (!details) return "";
  try {
    return Object.entries(JSON.parse(details) as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(" · ");
  } catch {
    return details;
  }
}

export default function AdminAudit() {
  const [page, setPage] = useState(1);
  const { data, error } = useAdmin<Paged<AuditRow>>(`/audit?page=${page}`);
  return (
    <>
      <PageHeader title="Activity log" />
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      <Table head={["When", "Who", "Action", "Target", "Details"]}>
        {data?.items.map((a) => (
          <tr key={a.id} className="align-top">
            <td className="whitespace-nowrap px-4 py-3 text-ink-500">{formatDateTime(a.createdAt)}</td>
            <td className="px-4 py-3 font-medium text-ink-900">{a.actor}</td>
            <td className="px-4 py-3"><code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">{a.action}</code></td>
            <td className="px-4 py-3">{a.targetType ? `${a.targetType} ${a.targetId}` : "–"}</td>
            <td className="max-w-md px-4 py-3 text-xs text-ink-600">{summary(a.details)}</td>
          </tr>
        ))}
      </Table>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </>
  );
}
