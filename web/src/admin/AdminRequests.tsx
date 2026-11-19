import { useState } from "react";
import { Link } from "react-router-dom";
import type { AdminRequestRow, Paged } from "@shared/adminApi";
import { formatDateTime, formatINR } from "@shared/format";
import { formatWhatsapp } from "@shared/phone";
import { Alert } from "../components/ui";
import { FilterTabs, KindBadge, PageHeader, Pagination, RequestStatusBadge, SearchBox, Table, useAdmin } from "./adminUi";

type StatusFilter = "pending" | "approved" | "rejected" | "";

export default function AdminRequests() {
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ status, kind, q, page: String(page) });
  const { data, error } = useAdmin<Paged<AdminRequestRow>>(`/requests?${params}`);

  return (
    <>
      <PageHeader title="Requests" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterTabs<StatusFilter>
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "", label: "All" },
          ]}
        />
        <select
          className="input w-auto"
          value={kind}
          aria-label="Type"
          onChange={(e) => {
            setKind(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All types</option>
          <option value="new">New customer</option>
          <option value="renewal">Renewal</option>
          <option value="instant">Instant download</option>
        </select>
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Search code, name, number"
        />
      </div>
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      <Table head={["Code", "Type", "Customer", "Plan", "Status", "Created"]}>
        {data?.items.map((r) => (
          <tr key={r.id} className="hover:bg-ink-50">
            <td className="px-4 py-3">
              <Link to={`/admin/requests/${r.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                {r.code}
              </Link>
            </td>
            <td className="px-4 py-3"><KindBadge kind={r.kind} /></td>
            <td className="px-4 py-3">
              <span className="font-medium text-ink-900">{r.name}</span>
              <span className="block text-xs text-ink-500">{formatWhatsapp(r.whatsapp)}</span>
            </td>
            <td className="px-4 py-3">{r.planName} · {formatINR(r.price)}</td>
            <td className="px-4 py-3"><RequestStatusBadge status={r.status} /></td>
            <td className="px-4 py-3 text-ink-500">{formatDateTime(r.createdAt)}</td>
          </tr>
        ))}
        {data && data.items.length === 0 && (
          <tr>
            <td colSpan={6} className="px-4 py-10 text-center text-ink-500">No requests.</td>
          </tr>
        )}
      </Table>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </>
  );
}
