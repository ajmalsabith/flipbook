import { useEffect, useState, type FormEvent } from "react";
import { formatWhatsapp } from "@shared/phone";
import { Alert, Button, Field, PageLoader } from "../components/ui";
import { ApiError, errorMessage } from "../lib/api";
import { adminApi, PageHeader, useAdmin } from "./adminUi";

type Settings = {
  whatsappNumber: string;
  freeDownloadLimit: number;
  freeIpDailyLimit: number;
  freeLinkHours: number;
  maxPdfMb: number;
  maxPages: number;
  watermarkText: string;
};

export default function AdminSettings() {
  const { data, setData, error } = useAdmin<Settings>("/settings");
  const [form, setForm] = useState<Settings | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!form) return <PageLoader />;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setMessage(null);
    setFields({});
    try {
      const saved = await adminApi<Settings>("/settings", "PUT", { ...form, whatsappNumber: form.whatsappNumber.replace(/\D/g, "") });
      setData(saved);
      setMessage({ tone: "success", text: "Settings saved." });
    } catch (err) {
      if (err instanceof ApiError && err.body.fields) setFields(err.body.fields);
      setMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <form onSubmit={save} className="card max-w-3xl p-6">
        <h2 className="font-bold text-ink-900">WhatsApp</h2>
        <Field
          className="mt-4"
          label="Admin WhatsApp number"
          value={form.whatsappNumber}
          onChange={(e) => set("whatsappNumber", e.target.value)}
          error={fields.whatsappNumber}
          hint={`Country code + number, digits only, e.g. 919876543210. Customers' payment messages go to ${formatWhatsapp(form.whatsappNumber.replace(/\D/g, ""))}.`}
        />

        <h2 className="mt-8 font-bold text-ink-900">Free plan</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Free downloads per visitor" type="number" min={0} value={form.freeDownloadLimit} onChange={(e) => set("freeDownloadLimit", num(e.target.value))} error={fields.freeDownloadLimit} />
          <Field label="Free downloads per IP per day" type="number" min={0} value={form.freeIpDailyLimit} onChange={(e) => set("freeIpDailyLimit", num(e.target.value))} hint="0 = no limit" error={fields.freeIpDailyLimit} />
          <Field label="Free share link (hours)" type="number" min={1} value={form.freeLinkHours} onChange={(e) => set("freeLinkHours", num(e.target.value))} error={fields.freeLinkHours} />
        </div>

        <h2 className="mt-8 font-bold text-ink-900">Uploads</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Max PDF size (MB)" type="number" min={1} value={form.maxPdfMb} onChange={(e) => set("maxPdfMb", num(e.target.value))} error={fields.maxPdfMb} />
          <Field label="Max pages" type="number" min={1} value={form.maxPages} onChange={(e) => set("maxPages", num(e.target.value))} error={fields.maxPages} />
          <Field label="Watermark text" value={form.watermarkText} maxLength={40} onChange={(e) => set("watermarkText", e.target.value)} hint="Used for new uploads." error={fields.watermarkText} />
        </div>
        {message && <Alert tone={message.tone} className="mt-6">{message.text}</Alert>}
        <Button type="submit" className="mt-6" loading={busy}>Save settings</Button>
      </form>
      <PasswordForm />
    </>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await adminApi("/password", "POST", { current, next });
      setCurrent("");
      setNext("");
      setMessage({ tone: "success", text: "Admin password changed." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mt-6 max-w-3xl p-6">
      <h2 className="font-bold text-ink-900">Admin password</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <Field label="New password" type="password" autoComplete="new-password" minLength={10} hint="At least 10 characters." value={next} onChange={(e) => setNext(e.target.value)} required />
      </div>
      {message && <Alert tone={message.tone} className="mt-4">{message.text}</Alert>}
      <Button type="submit" variant="secondary" className="mt-5" loading={busy}>Change password</Button>
    </form>
  );
}
