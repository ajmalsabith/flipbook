import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Clock, RefreshCw, XCircle } from "lucide-react";
import type { RequestStatusResponse } from "@shared/api";
import { formatDateTime, formatINR } from "@shared/format";
import { whatsappLink } from "@shared/phone";
import { Alert, Badge, Button, CopyButton, LinkButton, PageLoader, WhatsAppButton } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { usePageMeta } from "../lib/meta";
import { recentRequests, rememberRequest } from "../lib/recentRequests";
import { useSession } from "../lib/session";

export default function RequestStatusPage() {
  const { code = "" } = useParams();
  const location = useLocation();
  const justCreated = !!(location.state as { justCreated?: boolean } | null)?.justCreated;
  const { config, me } = useSession();
  usePageMeta(`Request ${code.toUpperCase()}`, undefined, { noindex: true });
  const [data, setData] = useState<RequestStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setChecking(true);
    try {
      const result = await api<RequestStatusResponse>(`/requests/${encodeURIComponent(code)}`);
      setData(result);
      setError(null);
      rememberRequest(result.code);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  // While waiting for approval, check again every 30 seconds.
  useEffect(() => {
    if (data?.status !== "pending") return;
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [data?.status, load]);

  if (error && !data) {
    return (
      <div className="container-page max-w-xl py-16">
        <Alert tone="error" title="Request not found">{error}</Alert>
        <LinkButton to="/request" variant="secondary" className="mt-6">Look up another code</LinkButton>
      </div>
    );
  }
  if (!data) return <PageLoader />;

  const help = config ? whatsappLink(config.whatsappNumber, `Hi, about my request ${data.code}.`) : null;
  const what =
    data.kind === "instant" ? `Instant download${data.flipbookTitle ? ` of “${data.flipbookTitle}”` : ""}` : data.planName;

  return (
    <div className="container-page max-w-3xl py-12 sm:py-16">
      {justCreated && data.status === "pending" && (
        <Alert tone="success" className="mb-6" title={`Thanks ${data.firstName}! Your request is saved.`}>
          One more step: message us on WhatsApp to pay.
        </Alert>
      )}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 bg-ink-50/70 px-6 py-5">
          <div>
            <p className="text-sm text-ink-500">Reference code</p>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="font-mono text-2xl font-bold tracking-wider text-ink-900">{data.code}</h1>
              <CopyButton text={data.code} />
            </div>
          </div>
          <StatusBadge status={data.status} />
        </div>
        <dl className="grid gap-4 px-6 py-5 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-ink-500">Plan</dt>
            <dd className="font-semibold text-ink-900">{what}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-500">Price</dt>
            <dd className="font-semibold text-ink-900">{formatINR(data.price)}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-500">Requested</dt>
            <dd className="font-semibold text-ink-900">{formatDateTime(data.createdAt)}</dd>
          </div>
        </dl>

        <div className="border-t border-ink-100 px-6 py-6">
          {data.status === "pending" && data.payment && (
            <>
              <h2 className="text-lg font-bold text-ink-900">Pay on WhatsApp</h2>
              <ol className="mt-4 space-y-3">
                {data.payment.steps.map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-[15px] text-ink-700">{step}</span>
                  </li>
                ))}
              </ol>
              <WhatsAppButton href={data.payment.whatsappUrl} className="mt-6 w-full sm:w-auto" />
              <p className="mt-3 text-sm text-ink-500">
                The message is filled in for you with your plan, price and code <strong>{data.code}</strong>.
              </p>
              <div className="mt-5 flex items-center gap-2 text-sm text-ink-500">
                <Button variant="ghost" size="sm" onClick={() => void load()} loading={checking} icon={<RefreshCw className="h-4 w-4" />}>
                  Check status
                </Button>
                <span>This page updates by itself.</span>
              </div>
            </>
          )}
          {data.status === "approved" && (
            <div className="flex gap-4">
              <CheckCircle2 className="h-8 w-8 shrink-0 text-success-600" aria-hidden />
              <div>
                <h2 className="text-lg font-bold text-ink-900">Payment received – thank you!</h2>
                <p className="mt-1 text-ink-600">
                  {data.kind === "instant"
                    ? "We have sent your one-time download link on WhatsApp. It works once, so keep the file safe."
                    : data.kind === "renewal"
                      ? "Your plan has been renewed on the same account."
                      : "We have sent your username and password on WhatsApp."}
                </p>
                {data.kind !== "instant" && (
                  <LinkButton to={me?.customer ? "/dashboard" : "/login"} className="mt-4">
                    {me?.customer ? "Go to dashboard" : "Log in"}
                  </LinkButton>
                )}
              </div>
            </div>
          )}
          {data.status === "rejected" && (
            <div className="flex gap-4">
              <XCircle className="h-8 w-8 shrink-0 text-danger-600" aria-hidden />
              <div>
                <h2 className="text-lg font-bold text-ink-900">This request was not approved</h2>
                {data.rejectReason && <p className="mt-1 text-ink-600">{data.rejectReason}</p>}
                {help && <WhatsAppButton href={help} size="md" className="mt-4">Message us</WhatsAppButton>}
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-ink-500">
        Keep your code <strong>{data.code}</strong> to check this page later at{" "}
        <Link to="/request" className="link">Check request</Link>.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: RequestStatusResponse["status"] }) {
  if (status === "approved")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1.5 text-sm font-semibold text-success-700">
        <CheckCircle2 className="h-4 w-4" /> Approved
      </span>
    );
  if (status === "rejected")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-50 px-3 py-1.5 text-sm font-semibold text-danger-700">
        <XCircle className="h-4 w-4" /> Rejected
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-3 py-1.5 text-sm font-semibold text-accent-700">
      <Clock className="h-4 w-4" /> Waiting for payment
    </span>
  );
}

export function RequestLookupPage() {
  usePageMeta("Check a request", undefined, { noindex: true });
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const recent = recentRequests();

  function submit(e: FormEvent) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean) navigate(`/request/${encodeURIComponent(clean.startsWith("AMF-") ? clean : `AMF-${clean}`)}`);
  }

  return (
    <div className="container-page max-w-xl py-16">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">Check a request</h1>
      <p className="mt-2 text-ink-600">Enter the reference code you got when you chose a plan.</p>
      <form onSubmit={submit} className="card mt-6 flex flex-col gap-3 p-6 sm:flex-row">
        <label htmlFor="code" className="sr-only">Reference code</label>
        <input
          id="code"
          className="input flex-1 font-mono uppercase tracking-wider"
          placeholder="AMF-7K3Q"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          maxLength={12}
        />
        <Button type="submit">Check</Button>
      </form>
      {recent.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-ink-700">Your recent requests</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {recent.map((c) => (
              <li key={c}>
                <Link to={`/request/${c}`} className="inline-block">
                  <Badge tone="brand">{c}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
