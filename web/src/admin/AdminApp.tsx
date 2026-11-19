import { useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import {
  BookOpen,
  ClipboardList,
  ExternalLink,
  Gauge,
  History,
  LogOut,
  Settings,
  Tags,
  Users,
} from "lucide-react";
import { brandLogoUrl, brandName } from "@shared/theme";
import { Alert, Button, Field, PageLoader } from "../components/ui";
import { api, ApiError, errorMessage } from "../lib/api";
import { usePageMeta } from "../lib/meta";
import AdminDashboard from "./AdminDashboard";
import AdminRequests from "./AdminRequests";
import AdminRequestDetail from "./AdminRequestDetail";
import AdminCustomers from "./AdminCustomers";
import AdminCustomerDetail from "./AdminCustomerDetail";
import AdminPlans from "./AdminPlans";
import AdminFlipbooks from "./AdminFlipbooks";
import AdminSettings from "./AdminSettings";
import AdminAudit from "./AdminAudit";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: Gauge, end: true },
  { to: "/admin/requests", label: "Requests", icon: ClipboardList },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/flipbooks", label: "Flipbooks", icon: BookOpen },
  { to: "/admin/plans", label: "Plans", icon: Tags },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/audit", label: "Activity log", icon: History },
];

export default function AdminApp() {
  usePageMeta("Admin", undefined, { noindex: true });
  const [admin, setAdmin] = useState<{ username: string } | null | undefined>(undefined);

  useEffect(() => {
    api<{ username: string }>("/admin/me")
      .then(setAdmin)
      .catch(() => setAdmin(null));
  }, []);

  if (admin === undefined) return <PageLoader />;
  if (admin === null) return <AdminLogin onLogin={setAdmin} />;

  async function logout() {
    await api("/admin/logout", { method: "POST" });
    setAdmin(null);
  }

  return (
    <div className="min-h-screen bg-ink-50 lg:flex">
      <aside className="border-b border-ink-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-2 px-5 py-4">
          <Link to="/admin" className="flex items-center gap-2">
            <img src={brandLogoUrl} alt="" className="h-7 w-auto" />
            <span className="font-extrabold text-ink-900">{brandName}</span>
            <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Admin</span>
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible" aria-label="Admin">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                }`
              }
            >
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-ink-100 p-3 lg:block">
          <a href="/" target="_blank" rel="noopener" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-100">
            <ExternalLink className="h-4 w-4" /> Open website
          </a>
          <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-100">
            <LogOut className="h-4 w-4" /> Log out {admin.username}
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <Routes>
          <Route index element={<AdminDashboard />} />
          <Route path="requests" element={<AdminRequests />} />
          <Route path="requests/:id" element={<AdminRequestDetail />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="customers/:id" element={<AdminCustomerDetail />} />
          <Route path="flipbooks" element={<AdminFlipbooks />} />
          <Route path="plans" element={<AdminPlans />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
        <button type="button" onClick={logout} className="mt-10 text-sm text-ink-500 underline lg:hidden">
          Log out
        </button>
      </main>
    </div>
  );
}

function AdminLogin({ onLogin }: { onLogin: (admin: { username: string }) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await api<{ username: string }>("/admin/login", { body: { username, password } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-7">
        <div className="flex items-center gap-2">
          <img src={brandLogoUrl} alt="" className="h-8 w-auto" />
          <span className="text-lg font-extrabold text-ink-900">{brandName} admin</span>
        </div>
        <div className="mt-6 flex flex-col gap-4">
          <Field label="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" loading={busy}>Log in</Button>
        </div>
      </form>
    </div>
  );
}
