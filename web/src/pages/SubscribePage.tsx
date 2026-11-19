import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Check, ShieldCheck } from "lucide-react";
import type { FlipbookSummary, RequestStatusResponse } from "@shared/api";
import { describeDays, describeDownloads, describeHours, formatINR } from "@shared/format";
import { formatWhatsapp, normalizeWhatsapp } from "@shared/phone";
import { Alert, Button, Field, LinkButton, PageLoader } from "../components/ui";
import { api, ApiError, errorMessage } from "../lib/api";
import { usePageMeta } from "../lib/meta";
import { rememberRequest } from "../lib/recentRequests";
import { useSession } from "../lib/session";

export default function SubscribePage() {
  const { planCode } = useParams();
  const [params] = useSearchParams();
  const flipbookId = params.get("flipbook");
  const navigate = useNavigate();
  const { plans, me, ready } = useSession();
  const plan = plans.find((p) => p.code === planCode);
  usePageMeta(plan ? `Get ${plan.name}` : "Choose a plan", undefined, { noindex: true });

  const customer = me?.customer ?? null;
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flipbook, setFlipbook] = useState<FlipbookSummary | null>(null);
  const [flipbookError, setFlipbookError] = useState<string | null>(null);

  useEffect(() => {
    if (customer) {
      setName((v) => v || customer.name);
      setWhatsapp((v) => v || formatWhatsapp(customer.whatsapp).replace(/^\+91 /, ""));
      setEmail((v) => v || customer.email || "");
    }
  }, [customer]);

  useEffect(() => {
    if (plan?.type !== "instant" || !flipbookId) return;
    api<FlipbookSummary>(`/flipbooks/${encodeURIComponent(flipbookId)}`)
      .then(setFlipbook)
      .catch((err) => setFlipbookError(errorMessage(err)));
  }, [plan, flipbookId]);

  if (!ready) return <PageLoader />;
  if (!plan) {
    return (
      <div className="container-page max-w-xl py-20 text-center">
        <h1 className="text-2xl font-bold text-ink-900">That plan is not available</h1>
        <LinkButton to="/pricing" className="mt-6">See all plans</LinkButton>
      </div>
    );
  }
  const instant = plan.type === "instant";
  if (instant && !flipbookId) {
    return (
      <div className="container-page max-w-xl py-20 text-center">
        <h1 className="text-2xl font-bold text-ink-900">Make your flipbook first</h1>
        <p className="mt-3 text-ink-600">
          The instant download is for one flipbook. Create it, then choose “Instant download” when you download.
        </p>
        <LinkButton to="/create" className="mt-6">Make a flipbook</LinkButton>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const fieldErrors: Record<string, string> = {};
    if (name.trim().length < 2) fieldErrors.name = "Enter your name.";
    if (!normalizeWhatsapp(whatsapp)) fieldErrors.whatsapp = "Enter a valid WhatsApp number, e.g. 98765 43210.";
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    setBusy(true);
    setFormError(null);
    try {
      const result = await api<RequestStatusResponse>("/requests", {
        body: { planCode: plan!.code, name, whatsapp, email, flipbookId },
      });
      rememberRequest(result.code);
      navigate(`/request/${result.code}`, { state: { justCreated: true } });
    } catch (err) {
      if (err instanceof ApiError && err.body.fields) setErrors(err.body.fields);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const features = instant
    ? [
        `Download “${flipbook?.title ?? "your flipbook"}” once, no watermark`,
        `Download link works for ${describeHours(plan.validityHours)}`,
        `Share link open for ${describeDays(plan.shareLinkDays)}, no watermark`,
      ]
    : [
        describeDownloads(plan.downloadLimit),
        `Valid for ${describeHours(plan.validityHours)}`,
        plan.watermark ? "With watermark" : "No watermark",
        `Share links open for ${describeDays(plan.shareLinkDays)}`,
      ];

  return (
    <div className="container-page max-w-5xl py-12 sm:py-16">
      <Link to="/pricing" className="text-sm font-medium text-ink-500 hover:text-ink-800">
        ← All plans
      </Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">
            {customer && !instant ? `Renew with ${plan.name}` : `Get ${plan.name}`}
          </h1>
          <p className="mt-2 text-ink-600">
            Fill in your details. Next, you pay on WhatsApp with UPI – we send you a QR code.
          </p>
          {customer && !instant && (
            <Alert className="mt-5" title={`This renews your account “${customer.username}”`}>
              Same username and password. Any time left on your current plan is added on.
            </Alert>
          )}
          {flipbookError && <Alert tone="error" className="mt-5">{flipbookError}</Alert>}
          <form onSubmit={submit} className="card mt-6 flex flex-col gap-5 p-6" noValidate>
            <Field
              label="Your name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              maxLength={80}
              required
            />
            <Field
              label="WhatsApp number"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              prefix="+91"
              placeholder="98765 43210"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              error={errors.whatsapp}
              hint="We send the payment QR code and your login here. Outside India? Type + and your country code."
              maxLength={30}
              required
            />
            <Field
              label="Email (optional)"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              maxLength={120}
            />
            {formError && !Object.keys(errors).length && <Alert tone="error">{formError}</Alert>}
            <Button type="submit" size="lg" loading={busy} disabled={instant && !flipbook}>
              Continue to payment
            </Button>
            <p className="flex items-center gap-2 text-sm text-ink-500">
              <ShieldCheck className="h-4 w-4 text-success-600" aria-hidden /> No card needed. You only pay after we
              reply on WhatsApp.
            </p>
          </form>
        </div>
        <aside className="card h-fit p-6 lg:sticky lg:top-24">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Your plan</p>
          <h2 className="mt-1 text-xl font-bold text-ink-900">{plan.name}</h2>
          <p className="mt-3 text-4xl font-extrabold text-ink-900">{formatINR(plan.price)}</p>
          <ul className="mt-5 space-y-2.5 text-sm text-ink-700">
            {features.map((f) => (
              <li key={f} className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden /> {f}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
