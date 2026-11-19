import { Link } from "react-router-dom";
import { BookOpen, ClipboardList, Download, IndianRupee, Users } from "lucide-react";
import type { AdminStats } from "@shared/adminApi";
import { formatDateTime, formatINR } from "@shared/format";
import { Alert, PageLoader } from "../components/ui";
import { KindBadge, PageHeader, useAdmin } from "./adminUi";

export default function AdminDashboard() {
  const { data, error } = useAdmin<AdminStats>("/stats");
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <PageLoader />;

  const cards = [
    { label: "Pending requests", value: data.pendingRequests, icon: ClipboardList, to: "/admin/requests", tone: "bg-accent-100 text-accent-700" },
    { label: "Active customers", value: data.activeCustomers, icon: Users, to: "/admin/customers", tone: "bg-brand-50 text-brand-700" },
    { label: "Downloads today", value: data.downloadsToday, icon: Download, to: "/admin/flipbooks", tone: "bg-success-50 text-success-700" },
    { label: "Flipbooks created", value: `${data.flipbooksCreated}`, sub: `${data.flipbooksToday} today`, icon: BookOpen, to: "/admin/flipbooks", tone: "bg-ink-100 text-ink-700" },
    { label: "Approved this month", value: formatINR(data.revenueThisMonth), sub: `${data.approvedThisMonth} payments`, icon: IndianRupee, to: "/admin/requests", tone: "bg-logo-red/10 text-logo-red" },
  ];

  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value, sub, icon: Icon, to, tone }) => (
          <Link key={label} to={to} className="card p-5 transition hover:shadow-lift">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-4 text-2xl font-extrabold text-ink-900">{value}</p>
            <p className="text-sm text-ink-500">
              {label}
              {sub && <span className="block text-xs">{sub}</span>}
            </p>
          </Link>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-ink-900">Waiting for approval</h2>
        {data.recentPending.length === 0 ? (
          <div className="card p-6 text-sm text-ink-500">Nothing pending.</div>
        ) : (
          <ul className="card divide-y divide-ink-100">
            {data.recentPending.map((r) => (
              <li key={r.id}>
                <Link to={`/admin/requests/${r.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-ink-50">
                  <span className="font-mono font-semibold text-ink-900">{r.code}</span>
                  <KindBadge kind={r.kind} />
                  <span className="text-ink-700">{r.name}</span>
                  <span className="text-ink-500">
                    {r.planName} · {formatINR(r.price)}
                  </span>
                  <span className="ml-auto text-sm text-ink-500">{formatDateTime(r.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
