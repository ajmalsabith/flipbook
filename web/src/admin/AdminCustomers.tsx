import { useState } from "react";
import { Link } from "react-router-dom";
import type { AdminCustomerRow, Paged } from "@shared/adminApi";
import { formatDate } from "@shared/format";
import { formatWhatsapp } from "@shared/phone";
import { Alert, Badge } from "../components/ui";
import { FilterTabs, PageHeader, Pagination, SearchBox, Table, useAdmin } from "./adminUi";

type StatusFilter = "" | "active" | "expired" | "disabled";

export function CustomerStatus({ c }: { c: Pick<AdminCustomerRow, "disabled" | "planStatus"> }) {
  if (c.disabled) return <Badge tone="danger">disabled</Badge>;
  if (c.planStatus === "active") return <Badge tone="success">active</Badge>;
  if (c.planStatus === "expired") return <Badge tone="warning">expired</Badge>;
  return <Badge>no plan</Badge>;
}

export default function AdminCustomers() {
  const [status, setStatus] = useState<StatusFilter>("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ status, q, page: String(page) });
  const { data, error } = useAdmin<Paged<AdminCustomerRow>>(`/customers?${params}`);

  return (
    <>
      <PageHeader title="Customers" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterTabs<StatusFilter>
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "All" },
            { value: "active", label: "Active" },
            { value: "expired", label: "Expired" },
            { value: "disabled", label: "Disabled" },
          ]}
        />
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Search username, name, number"
        />
      </div>
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      <Table head={["Username", "Customer", "Plan", "Expires", "Downloads", "Flipbooks", "Status"]}>
        {data?.items.map((c) => (
          <tr key={c.id} className="hover:bg-ink-50">
            <td className="px-4 py-3">
              <Link to={`/admin/customers/${c.id}`} className="font-semibold text-brand-700 hover:underline">
                {c.username}
              </Link>
            </td>
            <td className="px-4 py-3">
              {c.name}
              <span className="block text-xs text-ink-500">{formatWhatsapp(c.whatsapp)}</span>
            </td>
            <td className="px-4 py-3">{c.planName ?? "–"}</td>
            <td className="px-4 py-3">{c.planExpiresAt ? formatDate(c.planExpiresAt) : "–"}</td>
            <td className="px-4 py-3">
              {c.downloadsUsed} / {c.downloadsAllowed ?? "∞"}
            </td>
            <td className="px-4 py-3">{c.flipbookCount}</td>
            <td className="px-4 py-3"><CustomerStatus c={c} /></td>
          </tr>
        ))}
        {data && data.items.length === 0 && (
          <tr>
            <td colSpan={7} className="px-4 py-10 text-center text-ink-500">No customers yet.</td>
          </tr>
        )}
      </Table>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </>
  );
}
