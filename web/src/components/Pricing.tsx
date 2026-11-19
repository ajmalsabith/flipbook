import { Link } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import type { PublicConfig, PublicPlan } from "@shared/api";
import { describeDays, describeDownloads, describeHours, formatINR } from "@shared/format";
import { buttonClass } from "./ui";

type Card = {
  key: string;
  name: string;
  tagline: string;
  price: number;
  /** Shown under the price, e.g. "for 7 days" */
  period: string;
  features: string[];
  cta: { to: string; label: string; ariaLabel: string };
  highlight: boolean;
  note?: string;
};

function planCard(plan: PublicPlan): Card {
  const instant = plan.type === "instant";
  const features = instant
    ? [
        `${describeDownloads(plan.downloadLimit)} of 1 flipbook`,
        plan.watermark ? "With watermark" : "No watermark",
        `Download link works for ${describeHours(plan.validityHours)}`,
        `Share link open for ${describeDays(plan.shareLinkDays)}`,
        "No account needed",
      ]
    : [
        describeDownloads(plan.downloadLimit),
        plan.watermark ? "With watermark" : "No watermark",
        `Share links open for ${describeDays(plan.shareLinkDays)}`,
        "Your own login and dashboard",
      ];
  return {
    key: plan.code,
    name: plan.name,
    tagline: plan.tagline,
    price: plan.price,
    period: instant ? "one flipbook" : `for ${describeHours(plan.validityHours)}`,
    features,
    highlight: plan.highlight,
    cta: instant
      ? { to: "/create", label: "Make a flipbook", ariaLabel: `Make a flipbook, then choose ${plan.name}` }
      : { to: `/subscribe/${plan.code}`, label: "Choose plan", ariaLabel: `Choose ${plan.name}` },
    note: instant ? "Choose it when you download" : undefined,
  };
}

// Width of one card for n cards per row with a 1.25rem (gap-5) gap. A flex
// row (not a grid) so an incomplete last row is centred.
const CARD_WIDTH =
  "w-full sm:w-[calc((100%_-_1.25rem)/2)] lg:w-[calc((100%_-_2.5rem)/3)] xl:w-[calc((100%_-_5rem)/5)]";

export function PricingCards({ plans, config }: { plans: PublicPlan[]; config: PublicConfig | null }) {
  const free: Card = {
    key: "free",
    name: "Free",
    tagline: "Try it, no login",
    price: 0,
    period: "forever",
    features: [
      `${config?.freeDownloadLimit ?? 5} downloads in total`,
      `“${config?.watermarkText ?? "amflipbook"}” watermark`,
      `Share link open for ${describeHours(config?.freeLinkHours ?? 24)}`,
      "No account needed",
    ],
    highlight: false,
    cta: { to: "/create", label: "Start free", ariaLabel: "Start free" },
  };
  const cards = [free, ...plans.map(planCard)];

  return (
    <div className="flex flex-wrap justify-center gap-5">
      {cards.map((card) => {
        const dark = card.highlight;
        return (
          <div
            key={card.key}
            className={`relative flex flex-col rounded-2xl p-6 ${CARD_WIDTH} ${
              dark ? "bg-ink-900 text-white shadow-lift ring-2 ring-brand-500" : "card"
            }`}
          >
            {dark && (
              <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-accent-400 px-3 py-1 text-xs font-bold text-ink-900">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> Most popular
              </span>
            )}

            <h3 className={`text-lg font-bold leading-snug ${dark ? "text-white" : "text-ink-900"}`}>{card.name}</h3>
            <p className={`mt-1 min-h-[2.5rem] text-sm leading-5 ${dark ? "text-ink-300" : "text-ink-500"}`}>
              {card.tagline}
            </p>

            <div className="mt-4">
              <p className={`text-4xl font-extrabold tracking-tight ${dark ? "text-white" : "text-ink-900"}`}>
                {formatINR(card.price)}
              </p>
              <p className={`mt-1 text-sm ${dark ? "text-ink-300" : "text-ink-500"}`}>{card.period}</p>
            </div>

            <ul
              className={`mt-6 flex-1 space-y-3 border-t pt-6 text-sm ${dark ? "border-white/10" : "border-ink-100"}`}
            >
              {card.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Check
                    className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? "text-accent-300" : "text-brand-600"}`}
                    aria-hidden
                  />
                  <span className={dark ? "text-ink-100" : "text-ink-700"}>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <Link
                to={card.cta.to}
                aria-label={card.cta.ariaLabel}
                className={`w-full whitespace-nowrap ${buttonClass(
                  dark ? "primary" : card.key === "free" ? "secondary" : "dark",
                  "md"
                )}`}
              >
                {card.cta.label}
              </Link>
              {/* Same height in every card so all buttons line up. */}
              <p className={`mt-2 h-4 text-center text-xs ${dark ? "text-ink-300" : "text-ink-500"}`}>
                {card.note ?? ""}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PaymentSteps({ className = "" }: { className?: string }) {
  const steps = [
    ["Message us", "Tap “Continue on WhatsApp”. Your plan and reference code are filled in."],
    ["Get the UPI QR code", "We reply with a QR code. Pay with any UPI app."],
    ["Send the screenshot", "Send the payment screenshot in the same chat."],
    ["Get your login", "We send your username and password on WhatsApp."],
  ];
  return (
    <ol className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
      {steps.map(([title, text], i) => (
        <li key={title} className="card p-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
            {i + 1}
          </span>
          <h3 className="mt-3 font-semibold text-ink-900">{title}</h3>
          <p className="mt-1 text-sm text-ink-600">{text}</p>
        </li>
      ))}
    </ol>
  );
}
