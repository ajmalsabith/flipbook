import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { AdminCustomerDetail } from "@shared/adminApi";
import { formatDate, formatDateTime, formatINR } from "@shared/format";
import { formatWhatsapp } from "@shared/phone";
import { Alert, Button, CopyButton, Field, Modal, PageLoader, WhatsAppButton } from "../components/ui";
import { errorMessage } from "../lib/api";
import { CustomerStatus } from "./AdminCustomers";
import { adminApi, fromLocalInput, KindBadge, RequestStatusBadge, Table, toLocalInput, useAdmin } from "./adminUi";

type ResetResult = { username: string; password: string; message: string; whatsappUrl: string };

export default function AdminCustomerDetailPage() {
  const { id } = useParams();
  const { data, setData, error } = useAdmin<AdminCustomerDetail>(`/customers/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reset, setReset] = useState<ResetResult | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <PageLoader />;
  const c = data.customer;

  async function run(key: string, action: () => Promise<AdminCustomerDetail | void>) {
    setBusy(key);
    setActionError(null);
    try {
      const updated = await action();
      if (updated) setData(updated);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const patch = (key: string, body: Record<string, unknown>) =>
    run(key, () => adminApi<AdminCustomerDetail>(`/customers/${c.id}`, "PATCH", body));
  const extend = (hours: number) =>
    run(`extend-${hours}`, () => adminApi<AdminCustomerDetail>(`/customers/${c.id}/extend`, "POST", { hours }));

  async function resetPassword() {
    setConfirmReset(false);
    await run("reset", async () => {
      setReset(await adminApi<ResetResult>(`/customers/${c.id}/reset-password`, "POST"));
    });
  }

  return (
    <>
      <Link to="/admin/customers" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Customers
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink-900">{c.username}</h1>
        <CustomerStatus c={c} />
        <a href={data.chatUrl} target="_blank" rel="noopener noreferrer" className="link text-sm">
          Chat on WhatsApp
        </a>
      </div>
      {actionError && <Alert tone="error" className="mb-4">{actionError}</Alert>}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section className="card p-6">
          <h2 className="font-bold text-ink-900">Plan</h2>
          <p className="mt-2 text-sm text-ink-600">
            {c.planName ?? "No plan"} · {c.planExpiresAt ? `expires ${formatDateTime(c.planExpiresAt)}` : "no expiry"} ·{" "}
            {c.downloadsUsed} of {c.downloadsAllowed ?? "unlimited"} downloads used
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[24, 24 * 7, 24 * 30].map((h) => (
              <Button key={h} variant="secondary" size="sm" loading={busy === `extend-${h}`} onClick={() => extend(h)}>
                + {h / 24} day{h === 24 ? "" : "s"}
              </Button>
            ))}
          </div>
          <PlanEditor
            key={`${c.planExpiresAt}-${c.downloadsAllowed}-${c.downloadsUsed}`}
            expiresAt={c.planExpiresAt}
            downloadsAllowed={c.downloadsAllowed}
            downloadsUsed={c.downloadsUsed}
            busy={busy === "plan"}
            onSave={(body) => patch("plan", body)}
          />
        </section>

        <section className="card p-6">
          <h2 className="font-bold text-ink-900">Details</h2>
          <DetailsEditor
            key={`${c.name}-${c.whatsapp}-${c.email}`}
            name={c.name}
            whatsapp={c.whatsapp}
            email={c.email}
            busy={busy === "details"}
            onSave={(body) => patch("details", body)}
          />
          <div className="mt-6 flex flex-wrap gap-2 border-t border-ink-100 pt-5">
            <Button variant="secondary" loading={busy === "reset"} onClick={() => setConfirmReset(true)}>
              Reset password
            </Button>
            <Button
              variant={c.disabled ? "primary" : "secondary"}
              className={c.disabled ? "" : "text-danger-600"}
              loading={busy === "disable"}
              onClick={() => patch("disable", { disabled: !c.disabled })}
            >
              {c.disabled ? "Enable account" : "Disable account"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Customer since {formatDate(c.createdAt)} · last login {c.lastLoginAt ? formatDateTime(c.lastLoginAt) : "never"}
          </p>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-ink-900">Flipbooks</h2>
        <Table head={["Title", "Pages", "Views", "Downloads", "Link", "Created", ""]}>
          {data.flipbooks.map((f) => (
            <tr key={f.id}>
              <td className="px-4 py-3 font-medium text-ink-900">{f.title}</td>
              <td className="px-4 py-3">{f.pageCount}</td>
              <td className="px-4 py-3">{f.views}</td>
              <td className="px-4 py-3">{f.downloads}</td>
              <td className="px-4 py-3">{f.linkStatus} · {formatDate(f.linkExpiresAt)}</td>
              <td className="px-4 py-3">{formatDate(f.createdAt)}</td>
              <td className="px-4 py-3">
                {f.linkStatus !== "deleted" && (
                  <a href={`/v/${f.slug}`} target="_blank" rel="noopener" className="link inline-flex items-center gap-1">
                    Open <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </td>
            </tr>
          ))}
          {data.flipbooks.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-500">No flipbooks.</td></tr>
          )}
        </Table>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-ink-900">Requests</h2>
        <Table head={["Code", "Type", "Plan", "Status", "Created"]}>
          {data.requests.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3"><Link to={`/admin/requests/${r.id}`} className="font-mono font-semibold text-brand-700 hover:underline">{r.code}</Link></td>
              <td className="px-4 py-3"><KindBadge kind={r.kind} /></td>
              <td className="px-4 py-3">{r.planName} · {formatINR(r.price)}</td>
              <td className="px-4 py-3"><RequestStatusBadge status={r.status} /></td>
              <td className="px-4 py-3">{formatDateTime(r.createdAt)}</td>
            </tr>
          ))}
        </Table>
      </section>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset password?">
        <p className="text-ink-600">A new password is created and the customer is logged out everywhere. You then send it on WhatsApp.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmReset(false)}>Cancel</Button>
          <Button onClick={resetPassword}>Reset password</Button>
        </div>
      </Modal>
      <Modal open={!!reset} onClose={() => setReset(null)} title="New password">
        {reset && (
          <>
            <Alert tone="warning">Shown only once. Send it to the customer now.</Alert>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-ink-200 px-4 py-3">
              <span className="font-mono text-lg font-semibold text-ink-900">{reset.password}</span>
              <CopyButton text={reset.password} className="ml-auto" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <WhatsAppButton href={reset.whatsappUrl} size="md">Send on WhatsApp</WhatsAppButton>
              <CopyButton text={reset.message} label="Copy message" size="md" />
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

function PlanEditor({
  expiresAt,
  downloadsAllowed,
  downloadsUsed,
  busy,
  onSave,
}: {
  expiresAt: string | null;
  downloadsAllowed: number | null;
  downloadsUsed: number;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [expiry, setExpiry] = useState(toLocalInput(expiresAt));
  const [unlimited, setUnlimited] = useState(downloadsAllowed === null);
  const [allowed, setAllowed] = useState(downloadsAllowed ?? 5);
  const [used, setUsed] = useState(downloadsUsed);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({
      planExpiresAt: fromLocalInput(expiry),
      downloadsAllowed: unlimited ? null : allowed,
      downloadsUsed: used,
    });
  }

  return (
    <form onSubmit={submit} className="mt-5 grid gap-4 border-t border-ink-100 pt-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="pe-exp">Expires</label>
        <input id="pe-exp" type="datetime-local" className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="pe-allowed">Downloads allowed</label>
        <div className="flex items-center gap-3">
          <input id="pe-allowed" type="number" min={0} className="input w-24" disabled={unlimited} value={allowed} onChange={(e) => setAllowed(Math.max(0, Number(e.target.value)))} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} className="h-4 w-4 accent-brand-600" /> Unlimited
          </label>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="pe-used">Downloads used</label>
        <input id="pe-used" type="number" min={0} className="input w-24" value={used} onChange={(e) => setUsed(Math.max(0, Number(e.target.value)))} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy}>Save plan</Button>
      </div>
    </form>
  );
}

function DetailsEditor({
  name,
  whatsapp,
  email,
  busy,
  onSave,
}: {
  name: string;
  whatsapp: string;
  email: string | null;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [n, setN] = useState(name);
  const [w, setW] = useState(formatWhatsapp(whatsapp));
  const [e, setE] = useState(email ?? "");
  useEffect(() => {
    setW(formatWhatsapp(whatsapp));
  }, [whatsapp]);
  return (
    <form
      className="mt-4 grid gap-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        onSave({ name: n, whatsapp: w, email: e });
      }}
    >
      <Field label="Name" value={n} onChange={(ev) => setN(ev.target.value)} />
      <Field label="WhatsApp" value={w} onChange={(ev) => setW(ev.target.value)} />
      <Field label="Email" type="email" value={e} onChange={(ev) => setE(ev.target.value)} />
      <div>
        <Button type="submit" variant="secondary" loading={busy}>Save details</Button>
      </div>
    </form>
  );
}
