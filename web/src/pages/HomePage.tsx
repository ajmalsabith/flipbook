import {
  ArrowRight,
  BookOpen,
  Download,
  Link2,
  Maximize2,
  ShieldCheck,
  Smartphone,
  Upload,
  Volume2,
} from "lucide-react";
import { Faq, GENERAL_FAQ } from "../components/Faq";
import { PricingCards } from "../components/Pricing";
import { LinkButton } from "../components/ui";
import { usePageMeta } from "../lib/meta";
import { useSession } from "../lib/session";

const FEATURES = [
  { icon: BookOpen, title: "Pages that turn like paper", text: "Soft page curls, shadows and a stack of page edges. Drag a corner, tap, or use the arrow keys." },
  { icon: Link2, title: "Share one link", text: "Send it on WhatsApp, Instagram or email. The link shows a preview card with your cover." },
  { icon: Download, title: "Download one file", text: "Get a single .html file that works offline and can go on any website." },
  { icon: Smartphone, title: "Made for phones", text: "One page at a time on phones, two-page spreads on wide screens. Zoom in to read small print." },
  { icon: Volume2, title: "A gentle page sound", text: "A soft paper rustle with every turn, with a mute button that remembers the reader's choice." },
  { icon: ShieldCheck, title: "Your PDF stays private", text: "Pages are made in your browser. Add a “Download PDF” button only if you want to." },
];

const STEPS = [
  { icon: Upload, title: "Upload your PDF", text: "Drop a brochure, catalogue, menu or magazine. It is turned into pages in your browser." },
  { icon: Maximize2, title: "Preview and adjust", text: "Give it a title, choose a cover and image quality, and flip through the result." },
  { icon: Link2, title: "Share or download", text: "Copy your share link, send it on WhatsApp, or download the flipbook as one file." },
];

export default function HomePage() {
  const { plans, config } = useSession();
  usePageMeta(
    null,
    "Upload a PDF and get a realistic page-turning flipbook in seconds. Share one link on WhatsApp or download a single HTML file. Free to start."
  );

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-logo-orange/10 blur-3xl" />
          <div className="absolute -right-24 top-24 h-[28rem] w-[28rem] rounded-full bg-logo-blue/10 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-logo-green/10 blur-3xl" />
        </div>
        <div className="container-page grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-sm font-medium text-ink-600 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-logo-green" aria-hidden /> Free to start · no login needed
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-ink-900 sm:text-5xl lg:text-[3.4rem]">
              Turn any PDF into a{" "}
              <span className="bg-gradient-to-r from-brand-600 via-logo-blue to-logo-green bg-clip-text text-transparent">
                page-turning flipbook
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-600">
              Brochures, catalogues, menus and magazines that people actually enjoy reading. Share one link on
              WhatsApp, or download a single file that works anywhere.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <LinkButton to="/create" size="lg" icon={<Upload className="h-5 w-5" />}>
                Upload a PDF
              </LinkButton>
              <LinkButton to="/pricing" size="lg" variant="secondary">
                See pricing
              </LinkButton>
            </div>
            <p className="mt-4 text-sm text-ink-500">
              {config?.freeDownloadLimit ?? 5} free downloads · paid plans from ₹99 · pay on WhatsApp with UPI
            </p>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-3xl border border-ink-200/70 bg-white shadow-lift">
              <div className="flex items-center gap-1.5 border-b border-ink-100 bg-ink-50 px-4 py-2.5" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-logo-red/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-logo-orange/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-logo-green/70" />
                <span className="ml-3 truncate text-xs text-ink-400">amflipbook.amcloth.com/v/demo</span>
              </div>
              <iframe
                src="/v/demo"
                title="Live demo flipbook – click or drag the pages to turn them"
                className="block h-[420px] w-full border-0 sm:h-[520px]"
                loading="lazy"
                allowFullScreen
              />
            </div>
            <p className="mt-3 text-center text-sm text-ink-500">Live demo – drag a corner or use the arrows.</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-ink-100 bg-ink-50/60 py-16 sm:py-20" aria-labelledby="features">
        <div className="container-page">
          <div className="max-w-2xl">
            <h2 id="features" className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
              Everything a flipbook should do
            </h2>
            <p className="mt-3 text-lg text-ink-600">Built to feel like a real book, and to be easy to share in India.</p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <div key={title} className="card p-6">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                    ["bg-logo-orange/15 text-accent-700", "bg-logo-red/10 text-logo-red", "bg-logo-blue/10 text-brand-700", "bg-logo-green/10 text-success-700"][i % 4]
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-ink-900">{title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-20" aria-labelledby="how">
        <div className="container-page">
          <h2 id="how" className="text-center text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
            How it works
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-lg text-ink-600">Three steps, about a minute.</p>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-card">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <p className="mt-4 text-sm font-semibold text-brand-600">Step {i + 1}</p>
                <h3 className="mt-1 text-xl font-bold text-ink-900">{title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-ink-600">{text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12 text-center">
            <LinkButton to="/create" size="lg" icon={<ArrowRight className="h-5 w-5" />}>
              Make your flipbook
            </LinkButton>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-ink-100 bg-ink-50/60 py-16 sm:py-20" aria-labelledby="pricing">
        <div className="container-page max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="pricing" className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
              Simple prices in rupees
            </h2>
            <p className="mt-3 text-lg text-ink-600">Start free. Pay on WhatsApp with UPI when you need more.</p>
          </div>
          <div className="mt-12">
            <PricingCards plans={plans} config={config} />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 sm:py-20" aria-labelledby="faq">
        <div className="container-page max-w-3xl">
          <h2 id="faq" className="text-center text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
            Questions
          </h2>
          <div className="mt-10">
            <Faq items={GENERAL_FAQ} />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-20">
        <div className="container-page">
          <div className="relative overflow-hidden rounded-3xl bg-ink-900 px-6 py-14 text-center sm:px-12">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-logo-blue/30 blur-2xl" aria-hidden />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-logo-orange/25 blur-2xl" aria-hidden />
            <h2 className="relative text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Your next brochure deserves better than a PDF
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-lg text-ink-300">
              Make a flipbook in a minute. It's free to try.
            </p>
            <div className="relative mt-8">
              <LinkButton to="/create" size="lg" icon={<Upload className="h-5 w-5" />}>
                Upload a PDF
              </LinkButton>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
