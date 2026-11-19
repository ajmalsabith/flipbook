import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, KeyRound } from "lucide-react";
import type { AdminRequestDetail, ApproveResult } from "@shared/adminApi";
import { describeHours, formatDateTime, formatINR } from "@shared/format";
import { formatWhatsapp } from "@shared/phone";
import { Alert, Badge, Button, CopyButton, PageLoader, WhatsAppButton } from "../components/ui";
import { errorMessage } from "../lib/api";
import { adminApi, KindBadge, RequestStatusBadge, useAdmin } from "./adminUi";

type Unit = "days" | "hours";

function splitHours(hours: number): { value: number; unit: Unit } {
  return hours % 24 === 0 ? { value: hours / 24, unit: "days" } : { value: hours, unit: "hours" };
}

export default function AdminRequestDetailPage() {
  const { id } = useParams();
  const { data, error, reload } = useAdmin<AdminRequestDetail>(`/requests/${id}`);
  const [result, setResult] = useState<ApproveResult | null>(null);
  const [rejected, setRejected] = useState<{ whatsappUrl: string } | null>(null);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <PageLoader />;
  const r = data.request;

  return (
    <>
      <Link to="/admin/requests" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Requests
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold text-ink-900">{r.code}</h1>
        <KindBadge kind={r.kind} />
        <RequestStatusBadge status={r.status} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <section className="card p-6">
            <h2 className="font-bold text-ink-900">Request</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Item label="Name">{r.name}</Item>
              <Item label="WhatsApp">
                <a href={data.chatUrl} target="_blank" rel="noopener noreferrer" className="link">
                  {formatWhatsapp(r.whatsapp)}
                </a>
              </Item>
              <Item label="Email">{r.email ?? "–"}</Item>
              <Item label="Plan requested">
                {r.planName} · {formatINR(r.price)}
              </Item>
              <Item label="Created">{formatDateTime(r.createdAt)}</Item>
              <Item label="Payment method">{r.paymentMethod === "whatsapp_manual" ? "WhatsApp + UPI" : r.paymentMethod}</Item>
              {r.decidedAt && (
                <Item label={r.status === "approved" ? "Approved" : "Rejected"}>
                  {formatDateTime(r.decidedAt)} by {r.decidedBy ?? "–"}
                </Item>
              )}
              {r.paymentRef && <Item label="Payment ref / UTR">{r.paymentRef}</Item>}
              {r.note && <Item label="Note">{r.note}</Item>}
              {r.rejectReason && <Item label="Reject reason">{r.rejectReason}</Item>}
            </dl>
          </section>

          {data.flipbook && (
            <section className="card flex gap-4 p-6">
              <img src={data.flipbook.thumbUrl} alt="" className="h-24 w-20 rounded border border-ink-100 object-contain" />
              <div className="min-w-0">
                <h2 className="font-bold text-ink-900">Flipbook</h2>
                <p className="truncate text-sm text-ink-700">{data.flipbook.title}</p>
                <p className="text-sm text-ink-500">
                  {data.flipbook.pageCount} pages · link {data.flipbook.linkStatus} until {formatDateTime(data.flipbook.linkExpiresAt)} ·{" "}
                  {data.flipbook.watermarked ? "watermarked" : "clean"}
                </p>
                <a href={`/v/${data.flipbook.slug}`} target="_blank" rel="noopener" className="link mt-1 inline-flex items-center gap-1 text-sm">
                  Open <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </section>
          )}

          {data.customer && (
            <section className="card p-6">
              <h2 className="font-bold text-ink-900">Customer account</h2>
              <p className="mt-2 text-sm text-ink-700">
                <Link to={`/admin/customers/${data.customer.id}`} className="link">{data.customer.username}</Link> ·{" "}
                {data.customer.planName ?? "no plan"} · {data.customer.planStatus}
                {data.customer.planExpiresAt && ` until ${formatDateTime(data.customer.planExpiresAt)}`}
              </p>
            </section>
          )}

          {data.instantTokens.length > 0 && (
            <InstantLinks detail={data} onChange={reload} />
          )}
        </div>

        <div className="flex flex-col gap-6">
          {result && <ApprovalResult result={result} />}
          {rejected && (
            <section className="card p-6">
              <h2 className="font-bold text-ink-900">Request rejected</h2>
              <p className="mt-1 text-sm text-ink-600">Let the customer know:</p>
              <WhatsAppButton href={rejected.whatsappUrl} size="md" className="mt-4">
                Send on WhatsApp
              </WhatsAppButton>
            </section>
          )}
          {r.status === "pending" && !result && !rejected && (
            <>
              <ApproveForm
                detail={data}
                onApproved={(res) => {
                  setResult(res);
                  void reload();
                }}
              />
              <RejectForm
                id={r.id}
                onRejected={(res) => {
                  setRejected(res);
                  void reload();
                }}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-ink-500">{label}</dt>
      <dd className="font-medium text-ink-900">{children}</dd>
    </div>
  );
}

function ApproveForm({ detail, onApproved }: { detail: AdminRequestDetail; onApproved: (r: ApproveResult) => void }) {
  const r = detail.request;
  const instant = r.kind === "instant";
  const plans = useMemo(
    () => detail.plans.filter((p) => (instant ? p.type === "instant" : p.type === "subscription")),
    [detail.plans, instant]
  );
  const [planId, setPlanId] = useState(plans.some((p) => p.id === r.planId) ? r.planId : plans[0]?.id);
  const plan = plans.find((p) => p.id === planId);
  const [paymentRef, setPaymentRef] = useState("");
  const [note, setNote] = useState("");
  const [unlimited, setUnlimited] = useState(false);
  const [downloads, setDownloads] = useState(5);
  const [validity, setValidity] = useState(1);
  const [unit, setUnit] = useState<Unit>("days");
  const [attach, setAttach] = useState<string>("new");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Fill in the plan's defaults whenever the plan changes.
  useEffect(() => {
    if (!plan) return;
    setUnlimited(plan.downloadLimit === null);
    setDownloads(plan.downloadLimit ?? 5);
    const v = splitHours(plan.validityHours);
    setValidity(v.value);
    setUnit(v.unit);
  }, [plan]);

  const hours = validity * (unit === "days" ? 24 : 1);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi<ApproveResult>(`/requests/${r.id}/approve`, "POST", {
        planId: plan.id,
        paymentRef: paymentRef || null,
        note: note || null,
        downloadsAllowed: instant || unlimited ? null : downloads,
        validityHours: hours,
        attachCustomerId: attach === "new" ? null : attach,
      });
      onApproved(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4 p-6">
      <h2 className="text-lg font-bold text-ink-900">Approve</h2>
      <p className="-mt-2 text-sm text-ink-500">Check the payment screenshot on WhatsApp first.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ap-plan">Plan</label>
          <select id="ap-plan" className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatINR(p.price)}
                {p.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ap-ref">Payment ref / UTR</label>
          <input id="ap-ref" className="input" value={paymentRef} maxLength={100} onChange={(e) => setPaymentRef(e.target.value)} placeholder="e.g. 4123 5678 9012" />
        </div>
        {!instant && (
          <div>
            <label className="label" htmlFor="ap-dl">Downloads allowed</label>
            <div className="flex items-center gap-3">
              <input
                id="ap-dl"
                type="number"
                min={1}
                className="input w-28"
                value={downloads}
                disabled={unlimited}
                onChange={(e) => setDownloads(Math.max(1, Number(e.target.value)))}
              />
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                Unlimited
              </label>
            </div>
          </div>
        )}
        <div>
          <label className="label" htmlFor="ap-val">{instant ? "Download link valid for" : "Plan valid for"}</label>
          <div className="flex gap-2">
            <input id="ap-val" type="number" min={1} className="input w-24" value={validity} onChange={(e) => setValidity(Math.max(1, Number(e.target.value)))} />
            <select className="input w-auto" value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Unit">
              <option value="days">days</option>
              <option value="hours">hours</option>
            </select>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {r.kind === "renewal" ? "Added to any time left on the current plan." : describeHours(hours)}
          </p>
        </div>
      </div>
      {r.kind === "new" && detail.matchingCustomers.length > 0 && (
        <fieldset className="rounded-xl border border-accent-200 bg-accent-50 p-4">
          <legend className="px-1 text-sm font-semibold text-accent-700">This WhatsApp number already has an account</legend>
          <div className="flex flex-col gap-2 text-sm">
            {detail.matchingCustomers.map((c) => (
              <label key={c.id} className="flex items-center gap-2">
                <input type="radio" name="attach" value={c.id} checked={attach === String(c.id)} onChange={(e) => setAttach(e.target.value)} className="accent-brand-600" />
                Extend <strong>{c.username}</strong> ({c.planName ?? "no plan"}, {c.planStatus})
              </label>
            ))}
            <label className="flex items-center gap-2">
              <input type="radio" name="attach" value="new" checked={attach === "new"} onChange={(e) => setAttach(e.target.value)} className="accent-brand-600" />
              Create a new account
            </label>
          </div>
        </fieldset>
      )}
      <div>
        <label className="label" htmlFor="ap-note">Note (only admins see this)</label>
        <textarea id="ap-note" className="input min-h-[70px]" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" size="lg" loading={busy} disabled={!plan}>
        {instant ? "Approve and create download link" : r.kind === "renewal" || attach !== "new" ? "Approve and extend account" : "Approve and create login"}
      </Button>
    </form>
  );
}

function RejectForm({ id, onRejected }: { id: string; onRejected: (r: { whatsappUrl: string }) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onRejected(await adminApi<{ whatsappUrl: string }>(`/requests/${id}/reject`, "POST", { reason }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="card flex flex-col gap-3 p-6">
      <h2 className="font-bold text-ink-900">Reject</h2>
      <label className="sr-only" htmlFor="rej">Reason</label>
      <textarea
        id="rej"
        className="input min-h-[70px]"
        placeholder="Reason, e.g. Payment not received"
        value={reason}
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
        required
        minLength={3}
      />
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" variant="secondary" loading={busy} className="text-danger-600">
        Reject request
      </Button>
    </form>
  );
}

function ApprovalResult({ result }: { result: ApproveResult }) {
  return (
    <section className="card border-2 border-success-600 p-6">
      <Badge tone="success">Approved</Badge>
      {result.credentials && (
        <>
          <h2 className="mt-3 flex items-center gap-2 text-lg font-bold text-ink-900">
            <KeyRound className="h-5 w-5 text-brand-600" /> Login for the customer
          </h2>
          <Alert tone="warning" className="mt-3">
            The password is shown only once. If it gets lost, reset it on the customer's page.
          </Alert>
          <dl className="mt-4 grid gap-3">
            <Secret label="Username" value={result.credentials.username} />
            <Secret label="Password" value={result.credentials.password} />
          </dl>
        </>
      )}
      {result.instantLink && (
        <>
          <h2 className="mt-3 text-lg font-bold text-ink-900">One-time download link</h2>
          <p className="text-sm text-ink-500">
            Works once, until {result.instantExpiresAt && formatDateTime(result.instantExpiresAt)}.
          </p>
          <div className="mt-3"><Secret label="Link" value={result.instantLink} /></div>
        </>
      )}
      {!result.credentials && !result.instantLink && result.customer && (
        <h2 className="mt-3 text-lg font-bold text-ink-900">
          Account {result.customer.username} extended until {result.customer.planExpiresAt && formatDateTime(result.customer.planExpiresAt)}
        </h2>
      )}
      <div className="mt-5">
        <p className="label">Message</p>
        <pre className="whitespace-pre-wrap rounded-xl bg-ink-50 p-4 font-sans text-sm text-ink-800">{result.message}</pre>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <WhatsAppButton href={result.whatsappUrl} size="md">Send on WhatsApp</WhatsAppButton>
        <CopyButton text={result.message} label="Copy message" size="md" />
      </div>
    </section>
  );
}

function Secret({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink-200 px-4 py-2.5">
      <dt className="w-20 shrink-0 text-sm text-ink-500">{label}</dt>
      <dd className="min-w-0 flex-1 truncate font-mono text-[15px] font-semibold text-ink-900">{value}</dd>
      <CopyButton text={value} />
    </div>
  );
}

function InstantLinks({ detail, onChange }: { detail: AdminRequestDetail; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ instantLink: string; whatsappUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const instantPlan = detail.plans.find((p) => p.type === "instant");

  async function reissue() {
    setBusy(true);
    setError(null);
    try {
      setFresh(
        await adminApi(`/requests/${detail.request.id}/reissue`, "POST", {
          validityHours: instantPlan?.validityHours ?? 48,
        })
      );
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <h2 className="font-bold text-ink-900">One-time download links</h2>
      <ul className="mt-3 divide-y divide-ink-100 text-sm">
        {detail.instantTokens.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
            <Badge tone={t.status === "active" ? "success" : t.status === "used" ? "brand" : "neutral"}>{t.status}</Badge>
            <span className="text-ink-600">
              {t.usedAt ? `used ${formatDateTime(t.usedAt)}` : `expires ${formatDateTime(t.expiresAt)}`}
            </span>
            {t.link && <CopyButton text={t.link} label="Copy link" className="ml-auto" />}
          </li>
        ))}
      </ul>
      {fresh && (
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={fresh.instantLink} label="Copy new link" size="md" />
          <WhatsAppButton href={fresh.whatsappUrl} size="md">Send on WhatsApp</WhatsAppButton>
        </div>
      )}
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      <Button variant="secondary" size="sm" className="mt-4" loading={busy} onClick={reissue}>
        Make a new link (old ones stop working)
      </Button>
    </section>
  );
}
