import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white">
      {items.map((item) => (
        <details key={item.q} className="group px-5 py-4 sm:px-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-1 text-left font-semibold text-ink-900">
            {item.q}
            <ChevronDown className="h-5 w-5 shrink-0 text-ink-400 transition group-open:rotate-180" aria-hidden />
          </summary>
          <div className="pb-1 pt-2 text-[15px] leading-relaxed text-ink-600">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

export const GENERAL_FAQ = [
  {
    q: "Is my PDF uploaded somewhere?",
    a: "Your PDF is turned into page images right in your browser. Only those page images (and the PDF itself, if you add a “Download PDF” button) are stored, so your share link works.",
  },
  {
    q: "What do I get when I download?",
    a: "One .html file with every page inside. It opens in any browser, works without internet, and you can put it on your own website or send it as a file.",
  },
  {
    q: "How do I pay?",
    a: "On WhatsApp with UPI. Choose a plan, tap “Continue on WhatsApp”, and we send you a UPI QR code. After you send the payment screenshot we activate your plan, usually within minutes during the day.",
  },
  {
    q: "What happens when my plan ends?",
    a: "You can still log in and see your flipbooks, but new downloads need a new plan. Renewing keeps the same username and password, and any time left on your plan is added on.",
  },
  {
    q: "How long do share links work?",
    a: "Free links work for 1 day. Paid links stay open for 7 to 90 days depending on the plan. After that the link shows a friendly “link expired” page.",
  },
  {
    q: "Does it work on phones?",
    a: "Yes. Readers can swipe or tap to turn pages, zoom in, and go full screen on any phone, tablet or computer.",
  },
];
