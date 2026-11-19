import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { whatsappLink } from "@shared/phone";
import { Logo } from "../components/Layout";
import { Alert, Button, Field } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { usePageMeta } from "../lib/meta";
import { useSession } from "../lib/session";

export default function LoginPage() {
  usePageMeta("Log in", undefined, { noindex: true });
  const { me, refresh, config } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/dashboard";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me?.customer) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { body: { username, password } });
      await refresh();
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page flex justify-center py-16 sm:py-24">
      <div className="w-full max-w-md">
        <div className="text-center">
          <Logo />
          <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-ink-900">Log in to your account</h1>
          <p className="mt-2 text-ink-600">Use the username and password we sent you on WhatsApp.</p>
        </div>
        <form onSubmit={submit} className="card mt-8 flex flex-col gap-5 p-6 sm:p-7">
          <Field
            label="Username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" size="lg" loading={busy}>
            Log in
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-600">
          No account yet? <Link to="/pricing" className="link">Choose a plan</Link>
          {config && (
            <>
              {" · "}
              <a
                className="link"
                href={whatsappLink(config.whatsappNumber, "Hi, I forgot my amflipbook password.")}
                target="_blank"
                rel="noopener noreferrer"
              >
                Forgot password?
              </a>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
