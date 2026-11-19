import { useState } from "react";
import type { AdminPlan } from "@shared/adminApi";
import { describeHours, formatINR } from "@shared/format";
import { Alert, Badge, Button, PageLoader } from "../components/ui";
import { errorMessage } from "../lib/api";
import { adminApi, PageHeader, useAdmin } from "./adminUi";

export default function AdminPlans() {
  const { data, error, setData } = useAdmin<AdminPlan[]>("/plans");
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <PageLoader />;
  return (
    <>
      <PageHeader title="Plans" />
      <p className="mb-5 max-w-3xl text-sm text-ink-600">
        Changes show on the pricing page straight away. Customers who already paid keep the terms they bought. Free
        limits are in Settings.
      </p>
      <div className="grid gap-5 2xl:grid-cols-2">
        {data.map((plan) => (
          <PlanForm key={plan.id} plan={plan} onSaved={(p) => setData(data.map((x) => (x.id === p.id ? p : x)))} />
        ))}
      </div>
    </>
  );
}

function PlanForm({ plan, onSaved }: { plan: AdminPlan; onSaved: (p: AdminPlan) => void }) {
  const [form, setForm] = useState(plan);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const set = <K extends keyof AdminPlan>(key: K, value: AdminPlan[K]) => setForm((f) => ({ ...f, [key]: value }));
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const { id, code: _code, type: _type, ...body } = form;
      const saved = await adminApi<AdminPlan>(`/plans/${id}`, "PATCH", body);
      onSaved(saved);
      setForm(saved);
      setMessage({ tone: "success", text: "Saved." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const instant = plan.type === "instant";
  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-ink-900">{plan.name}</h2>
        <Badge tone={instant ? "warning" : "brand"}>{plan.type}</Badge>
        <Badge>{plan.code}</Badge>
        {!form.active && <Badge tone="danger">hidden</Badge>}
        <span className="ml-auto text-sm text-ink-500">{formatINR(form.price)}</span>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Name</span>
          <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Short description</span>
          <input className="input" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Price (₹)</span>
          <input type="number" min={0} className="input" value={form.price} onChange={(e) => set("price", num(e.target.value))} />
        </label>
        <div>
          <span className="label">Downloads</span>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              className="input w-24"
              aria-label="Downloads"
              disabled={form.downloadLimit === null}
              value={form.downloadLimit ?? ""}
              onChange={(e) => set("downloadLimit", Math.max(1, num(e.target.value)))}
            />
            {!instant && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-600"
                  checked={form.downloadLimit === null}
                  onChange={(e) => set("downloadLimit", e.target.checked ? null : 5)}
                />
                Unlimited
              </label>
            )}
          </div>
        </div>
        <label className="block">
          <span className="label">{instant ? "Download link valid (hours)" : "Plan validity (hours)"}</span>
          <input type="number" min={1} className="input" value={form.validityHours} onChange={(e) => set("validityHours", Math.max(1, num(e.target.value)))} />
          <span className="mt-1 block text-xs text-ink-500">= {describeHours(form.validityHours)}</span>
        </label>
        <label className="block">
          <span className="label">Share link valid (days)</span>
          <input type="number" min={1} className="input" value={form.shareLinkDays} onChange={(e) => set("shareLinkDays", Math.max(1, num(e.target.value)))} />
        </label>
        <label className="block">
          <span className="label">Order on pricing page</span>
          <input type="number" min={0} className="input" value={form.sortOrder} onChange={(e) => set("sortOrder", num(e.target.value))} />
        </label>
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.watermark} onChange={(e) => set("watermark", e.target.checked)} /> Watermark
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.highlight} onChange={(e) => set("highlight", e.target.checked)} /> “Most popular” badge
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Active (shown and can be bought)
          </label>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} loading={busy}>Save</Button>
        {message && <span className={`text-sm ${message.tone === "success" ? "text-success-700" : "text-danger-600"}`}>{message.text}</span>}
      </div>
    </section>
  );
}
