import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { CalendarClock, Download, ExternalLink, Eye, Plus, Trash2, TriangleAlert } from "lucide-react";
import type { DenyReason, FlipbookSummary } from "@shared/api";
import { formatDate, formatDateTime } from "@shared/format";
import { formatWhatsapp } from "@shared/phone";
import { UpsellDialog } from "../components/UpsellDialog";
import { Alert, Badge, Button, CopyButton, Field, LinkButton, Modal, PageLoader, ProgressBar } from "../components/ui";
import { api, ApiError, downloadFile, errorMessage } from "../lib/api";
import { usePageMeta } from "../lib/meta";
import { useSession } from "../lib/session";

export default function DashboardPage() {
  usePageMeta("Dashboard", undefined, { noindex: true });
  const { me, ready, refresh } = useSession();
  const [books, setBooks] = useState<FlipbookSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [upsell, setUpsell] = useState<{ reason: DenyReason; id: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FlipbookSummary | null>(null);
  const customer = me?.customer;

  const load = useCallback(() => {
    api<FlipbookSummary[]>("/flipbooks")
      .then(setBooks)
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(() => {
    if (customer) load();
  }, [customer, load]);

  if (!ready) return <PageLoader />;
  if (!customer) return <Navigate to="/login?next=/dashboard" replace />;

  const expired = customer.planStatus !== "active";
  const used = customer.downloadsUsed;
  const allowed = customer.downloadsAllowed;

  async function download(book: FlipbookSummary) {
    setBusyId(book.id);
    setError(null);
    try {
      await downloadFile(`/flipbooks/${book.id}/download`);
      await refresh();
      load();
    } catch (err) {
      if (err instanceof ApiError && err.body.reason) setUpsell({ reason: err.body.reason, id: book.id });
      else setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(book: FlipbookSummary) {
    setBusyId(book.id);
    try {
      await api(`/flipbooks/${book.id}`, { method: "DELETE" });
      setConfirmDelete(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="container-page max-w-6xl py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">Hi {customer.name.split(" ")[0]}</h1>
          <p className="mt-1 text-ink-600">Signed in as {customer.username}</p>
        </div>
        {!expired && (
          <LinkButton to="/create" icon={<Plus className="h-5 w-5" />}>
            New flipbook
          </LinkButton>
        )}
      </div>

      {expired ? (
        <section className="mt-8 overflow-hidden rounded-3xl border border-accent-200 bg-gradient-to-br from-accent-50 to-white p-8 text-center sm:p-12">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-100 text-accent-700">
            <TriangleAlert className="h-7 w-7" aria-hidden />
          </span>
          <h2 className="mt-5 text-2xl font-extrabold text-ink-900 sm:text-3xl">Your plan has expired</h2>
          <p className="mx-auto mt-3 max-w-lg text-ink-600">
            {customer.planName ? `Your ${customer.planName} plan` : "Your plan"}
            {customer.planExpiresAt ? ` ended on ${formatDateTime(customer.planExpiresAt)}` : " has ended"}. Your
            flipbooks are still here – choose a new plan to download without watermark again. Your login stays the
            same.
          </p>
          <LinkButton to="/pricing" size="lg" className="mt-7">
            Choose a new plan
          </LinkButton>
        </section>
      ) : (
        <section className="mt-8 grid gap-5 md:grid-cols-3" aria-label="Your plan">
          <div className="card p-6">
            <p className="text-sm text-ink-500">Plan</p>
            <p className="mt-1 flex items-center gap-2 text-xl font-bold text-ink-900">
              {customer.planName} <Badge tone="success">Active</Badge>
            </p>
            <p className="mt-2 text-sm text-ink-600">{customer.watermark ? "With watermark" : "No watermark"}</p>
          </div>
          <div className="card p-6">
            <p className="flex items-center gap-1.5 text-sm text-ink-500">
              <CalendarClock className="h-4 w-4" /> Valid until
            </p>
            <p className="mt-1 text-xl font-bold text-ink-900">{formatDateTime(customer.planExpiresAt!)}</p>
            <LinkButton to="/pricing" variant="secondary" size="sm" className="mt-3">
              Renew or upgrade
            </LinkButton>
          </div>
          <div className="card p-6">
            <p className="text-sm text-ink-500">Downloads</p>
            <p className="mt-1 text-xl font-bold text-ink-900">
              {allowed === null ? `${used} used · unlimited` : `${used} of ${allowed} used`}
            </p>
            {allowed !== null && <div className="mt-3"><ProgressBar value={Math.min(100, (used / Math.max(1, allowed)) * 100)} label="Downloads used" /></div>}
          </div>
        </section>
      )}

      <section className="mt-12" aria-labelledby="my-flipbooks">
        <h2 id="my-flipbooks" className="text-xl font-bold text-ink-900">
          My flipbooks
        </h2>
        {error && <Alert tone="error" className="mt-4">{error}</Alert>}
        {!books ? (
          <PageLoader />
        ) : books.length === 0 ? (
          <div className="card mt-4 p-10 text-center">
            <p className="text-ink-600">No flipbooks yet.</p>
            <LinkButton to="/create" className="mt-4" icon={<Plus className="h-5 w-5" />}>
              Make your first flipbook
            </LinkButton>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((book) => {
              const active = book.linkStatus === "active";
              return (
                <li key={book.id} className="card flex flex-col overflow-hidden">
                  <div className="flex h-44 items-center justify-center bg-ink-100">
                    {book.linkStatus !== "deleted" ? (
                      <img src={book.thumbUrl} alt={`Cover of ${book.title}`} className="h-full w-full object-contain p-3" loading="lazy" />
                    ) : (
                      <span className="text-sm text-ink-500">Files deleted</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="truncate font-semibold text-ink-900" title={book.title}>{book.title}</h3>
                    <p className="mt-1 text-sm text-ink-500">
                      {book.pageCount} pages · created {formatDate(book.createdAt)}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <span className="inline-flex items-center gap-1 text-ink-600">
                        <Eye className="h-4 w-4" /> {book.views} views
                      </span>
                      {active ? (
                        <Badge tone="success">Link open until {formatDate(book.linkExpiresAt)}</Badge>
                      ) : (
                        <Badge tone="warning">Link {book.linkStatus}</Badge>
                      )}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {active && <CopyButton text={book.shareUrl} label="Copy link" />}
                      {active && (
                        <a href={book.shareUrl} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-sm font-semibold text-ink-800 hover:bg-ink-50">
                          <ExternalLink className="h-4 w-4" /> Open
                        </a>
                      )}
                      {book.linkStatus !== "deleted" && (
                        <Button
                          size="sm"
                          variant="dark"
                          icon={<Download className="h-4 w-4" />}
                          loading={busyId === book.id}
                          onClick={() => download(book)}
                        >
                          Download
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-danger-600 hover:bg-danger-50"
                        aria-label={`Delete ${book.title}`}
                        onClick={() => setConfirmDelete(book)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AccountSection whatsapp={customer.whatsapp} />

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete this flipbook?">
        <p className="text-ink-600">
          “{confirmDelete?.title}” and its share link will be deleted for good. Downloaded files keep working.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="danger" loading={!!confirmDelete && busyId === confirmDelete.id} onClick={() => confirmDelete && remove(confirmDelete)}>
            Delete
          </Button>
        </div>
      </Modal>
      <UpsellDialog open={!!upsell} onClose={() => setUpsell(null)} reason={upsell?.reason ?? null} flipbookId={upsell?.id ?? null} />
    </div>
  );
}

function AccountSection({ whatsapp }: { whatsapp: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/auth/password", { body: { current, next } });
      setCurrent("");
      setNext("");
      setMessage({ tone: "success", text: "Password changed." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-12" aria-labelledby="account">
      <h2 id="account" className="text-xl font-bold text-ink-900">Account</h2>
      <div className="card mt-4 grid gap-6 p-6 md:grid-cols-[1fr_2fr]">
        <div>
          <p className="text-sm text-ink-500">WhatsApp</p>
          <p className="font-semibold text-ink-900">{formatWhatsapp(whatsapp)}</p>
        </div>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          <Field label="New password" type="password" autoComplete="new-password" minLength={10} hint="At least 10 characters." value={next} onChange={(e) => setNext(e.target.value)} required />
          <div className="sm:col-span-2">
            {message && <Alert tone={message.tone} className="mb-3">{message.text}</Alert>}
            <Button type="submit" variant="secondary" loading={busy}>Change password</Button>
          </div>
        </form>
      </div>
    </section>
  );
}
