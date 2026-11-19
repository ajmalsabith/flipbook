import { Faq } from "../components/Faq";
import { PaymentSteps, PricingCards } from "../components/Pricing";
import { Alert, PageLoader } from "../components/ui";
import { usePageMeta } from "../lib/meta";
import { useSession } from "../lib/session";

const PRICING_FAQ = [
  {
    q: "Which plan should I choose?",
    a: "For one flipbook, the ₹99 instant download is enough. For a few flipbooks in a day, take the 1-Day Pass. If you make flipbooks regularly, the weekly or monthly plan gives unlimited downloads.",
  },
  {
    q: "How fast is my plan activated?",
    a: "As soon as we see your payment screenshot on WhatsApp, usually within minutes during the day. You can check your request any time with its reference code.",
  },
  {
    q: "Do I need an account?",
    a: "Not for the free plan or the ₹99 instant download. Day, weekly and monthly plans come with a username and password that we send you on WhatsApp.",
  },
  {
    q: "Can I renew or upgrade?",
    a: "Yes. Log in and choose a plan – the same account is extended, and any time left is added on.",
  },
  {
    q: "Can I get a refund?",
    a: "Message us on WhatsApp within 24 hours if something did not work, and we will sort it out.",
  },
];

export default function PricingPage() {
  const { plans, config, me, ready } = useSession();
  usePageMeta("Pricing", "Free to start. Instant download ₹99, 1-Day Pass ₹199, Weekly Unlimited ₹499, Monthly Unlimited ₹1,499. Pay on WhatsApp with UPI.");
  if (!ready) return <PageLoader />;

  const expired = me?.customer?.planStatus === "expired";
  return (
    <div className="py-14 sm:py-20">
      <div className="container-page max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl">Pricing</h1>
          <p className="mt-4 text-lg text-ink-600">
            Start free. When you need clean downloads, pay once on WhatsApp with UPI – no card, no auto-renewal.
          </p>
        </div>
        {me?.customer && (
          <Alert tone={expired ? "warning" : "info"} className="mx-auto mt-8 max-w-2xl" title={expired ? "Your plan has expired" : `You are logged in as ${me.customer.username}`}>
            Choosing a plan renews this same account – no new login needed.
          </Alert>
        )}
        <div className="mt-12">
          <PricingCards plans={plans} config={config} />
        </div>

        <section className="mt-20" aria-labelledby="pay">
          <h2 id="pay" className="text-center text-2xl font-bold text-ink-900 sm:text-3xl">
            How paying works
          </h2>
          <PaymentSteps className="mt-8" />
        </section>

        <section className="mx-auto mt-20 max-w-3xl" aria-labelledby="pfaq">
          <h2 id="pfaq" className="text-center text-2xl font-bold text-ink-900 sm:text-3xl">
            Pricing questions
          </h2>
          <div className="mt-8">
            <Faq items={PRICING_FAQ} />
          </div>
        </section>
      </div>
    </div>
  );
}
