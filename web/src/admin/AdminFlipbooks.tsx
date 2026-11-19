import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Trash2 } from "lucide-react";
import type { AdminFlipbookRow, Paged } from "@shared/adminApi";
import type { FlipbookSummary } from "@shared/api";
import { formatDate } from "@shared/format";
import { Alert, Badge, Button, Modal } from "../components/ui";
import { errorMessage } from "../lib/api";
import { adminApi, FilterTabs, fromLocalInput, PageHeader, Pagination, SearchBox, Table, toLocalInput, useAdmin } from "./adminUi";

type StatusFilter = "" | "active" | "expired" | "disabled" | "deleted";

export default function AdminFlipbooks() {
  const [status, setStatus] = useState<StatusFilter>("");
  const [owner, setOwner] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ status, owner, q, page: String(page) });
  const { data, error, reload } = useAdmin<Paged<AdminFlipbookRow>>(`/flipbooks?${params}`);
  const [editing, setEditing] = useState<AdminFlipbookRow | null>(null);
  const [deleting, setDeleting] = useState<AdminFlipbookRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function patch(fb: AdminFlipbookRow, body: Record<string, unknown>) {
    setBusy(fb.id);
    setActionError(null);
    try {
      await adminApi<FlipbookSummary>(`/flipbooks/${fb.id}`, "PATCH", body);
      setEditing(null);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(fb: AdminFlipbookRow) {
    setBusy(fb.id);
    setActionError(null);
    try {
      await adminApi(`/flipbooks/${fb.id}`, "DELETE");
      setDeleting(null);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Flipbooks" />
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
            { value: "deleted", label: "Files deleted" },
          ]}
        />
        <select className="input w-auto" aria-label="Owner" value={owner} onChange={(e) => { setOwner(e.target.value); setPage(1); }}>
          <option value="">All owners</option>
          <option value="customer">Customers</option>
          <option value="anonymous">Anonymous (free)</option>
        </select>
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search title, link, username" />
      </div>
      {(error || actionError) && <Alert tone="error" className="mb-4">{error ?? actionError}</Alert>}
      <Table head={["Flipbook", "Owner", "Views", "Downloads", "Link", "Created", "Actions"]}>
        {data?.items.map((f) => (
          <tr key={f.id} className="align-top">
            <td className="px-4 py-3">
              <span className="font-medium text-ink-900">{f.title}</span>
              <span className="block text-xs text-ink-500">
                /v/{f.slug} · {f.pageCount} pages · {f.watermarked ? "watermarked" : "clean"}
              </span>
            </td>
            <td className="px-4 py-3">
              {f.owner.type === "customer" ? (
                <Link to={`/admin/customers/${f.owner.id}`} className="link">{f.owner.username}</Link>
              ) : (
                <span className="text-ink-500">anonymous</span>
              )}
            </td>
            <td className="px-4 py-3">{f.views}</td>
            <td className="px-4 py-3">{f.downloads}</td>
            <td className="px-4 py-3">
              <Badge tone={f.linkStatus === "active" ? "success" : f.linkStatus === "expired" ? "warning" : "danger"}>{f.linkStatus}</Badge>
              <span className="block text-xs text-ink-500">until {formatDate(f.linkExpiresAt)}</span>
            </td>
            <td className="px-4 py-3">{formatDate(f.createdAt)}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1.5">
                {!f.filesDeleted && (
                  <a href={`/v/${f.slug}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1 rounded-lg border border-ink-200 px-2.5 text-sm font-semibold hover:bg-ink-50" aria-label={`Open ${f.title}`}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <Button size="sm" variant="secondary" onClick={() => setEditing(f)}>Expiry</Button>
                <Button size="sm" variant="secondary" loading={busy === f.id && !editing && !deleting} onClick={() => patch(f, { disabled: f.linkStatus !== "disabled" })}>
                  {f.linkStatus === "disabled" ? "Enable" : "Disable"}
                </Button>
                <Button size="sm" variant="ghost" className="text-danger-600 hover:bg-danger-50" aria-label={`Delete ${f.title}`} onClick={() => setDeleting(f)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </td>
          </tr>
        ))}
        {data && data.items.length === 0 && (
          <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-500">No flipbooks.</td></tr>
        )}
      </Table>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Change link expiry">
        {editing && <ExpiryForm fb={editing} busy={busy === editing.id} onSave={(iso) => patch(editing, { linkExpiresAt: iso })} />}
      </Modal>
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete flipbook?">
        <p className="text-ink-600">“{deleting?.title}” and all its files will be deleted. This cannot be undone.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" loading={!!deleting && busy === deleting.id} onClick={() => deleting && remove(deleting)}>Delete</Button>
        </div>
      </Modal>
    </>
  );
}

function ExpiryForm({ fb, busy, onSave }: { fb: AdminFlipbookRow; busy: boolean; onSave: (iso: string) => void }) {
  const [value, setValue] = useState(toLocalInput(fb.linkExpiresAt));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const iso = fromLocalInput(value);
        if (iso) onSave(iso);
      }}
    >
      <label className="label" htmlFor="exp">Link open until</label>
      <input id="exp" type="datetime-local" className="input" value={value} onChange={(e) => setValue(e.target.value)} required />
      <div className="mt-6 flex justify-end">
        <Button type="submit" loading={busy}>Save</Button>
      </div>
    </form>
  );
}
