import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { brandLogoUrl, brandName } from "@shared/theme";
import { whatsappLink } from "@shared/phone";
import { useSession } from "../lib/session";
import { buttonClass, WhatsAppIcon } from "./ui";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2.5 rounded-lg ${className}`} aria-label={`${brandName} home`}>
      <img src={brandLogoUrl} alt="" width={32} height={34} className="h-8 w-auto" />
      <span className="text-[19px] font-extrabold tracking-tight text-ink-900">{brandName}</span>
    </Link>
  );
}

const NAV = [
  { to: "/create", label: "Create" },
  { to: "/pricing", label: "Pricing" },
  { to: "/request", label: "Check request" },
];

function Header() {
  const { me, logout } = useSession();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-[15px] font-medium transition ${
      isActive ? "text-brand-700" : "text-ink-600 hover:text-ink-900"
    }`;

  async function signOut() {
    await logout();
    navigate("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100/80 bg-white/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {me?.customer ? (
            <>
              <Link to="/dashboard" className={buttonClass("secondary", "sm")}>
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </Link>
              <button type="button" onClick={signOut} className={buttonClass("ghost", "sm")}>
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={buttonClass("ghost", "sm")}>
                Log in
              </Link>
              <Link to="/create" className={buttonClass("primary", "sm")}>
                Make a flipbook
              </Link>
            </>
          )}
        </div>
        <button
          type="button"
          className="rounded-lg p-2 text-ink-700 hover:bg-ink-100 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" className="border-t border-ink-100 bg-white md:hidden" aria-label="Main">
          <div className="container-page flex flex-col gap-1 py-3">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={navClass}>
                {item.label}
              </NavLink>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              {me?.customer ? (
                <>
                  <Link to="/dashboard" className={buttonClass("secondary", "md")}>
                    Dashboard
                  </Link>
                  <button type="button" onClick={signOut} className={buttonClass("ghost", "md")}>
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className={buttonClass("secondary", "md")}>
                    Log in
                  </Link>
                  <Link to="/create" className={buttonClass("primary", "md")}>
                    Make a flipbook
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}

function Footer() {
  const { config } = useSession();
  return (
    <footer className="border-t border-ink-100 bg-ink-50">
      <div className="container-page grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-600">
            Turn any PDF into a realistic page-turning flipbook. Share one link, or download a single file that works
            offline.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink-900">Product</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="text-ink-600 hover:text-ink-900" to="/create">Make a flipbook</Link></li>
            <li><Link className="text-ink-600 hover:text-ink-900" to="/pricing">Pricing</Link></li>
            <li><Link className="text-ink-600 hover:text-ink-900" to="/v/demo" reloadDocument>Live demo</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink-900">Help</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="text-ink-600 hover:text-ink-900" to="/request">Check a request</Link></li>
            <li><Link className="text-ink-600 hover:text-ink-900" to="/login">Customer login</Link></li>
            {config && (
              <li>
                <a
                  className="inline-flex items-center gap-1.5 text-ink-600 hover:text-ink-900"
                  href={whatsappLink(config.whatsappNumber, `Hi ${brandName}, I have a question.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <WhatsAppIcon className="h-4 w-4 text-whatsapp-600" /> WhatsApp us
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-100">
        <p className="container-page py-5 text-xs text-ink-500">
          © {new Date().getFullYear()} {brandName}. All prices in Indian Rupees.
        </p>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-white px-4 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
