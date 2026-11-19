import { Link } from "react-router-dom";
import { ArrowRight, Crown, Zap } from "lucide-react";
import type { DenyReason } from "@shared/api";
import { formatINR } from "@shared/format";
import { useSession } from "../lib/session";
import { Modal } from "./ui";

const TITLES: Record<DenyReason | "watermark", string> = {
  free_limit: "You've used your free downloads",
  ip_limit: "Free download limit reached for today",
  plan_limit: "You've used all downloads in your plan",
  plan_expired: "Your plan has expired",
  no_plan: "Choose a plan to download",
  account_disabled: "This account is disabled",
  watermark: "Download without watermark",
};

export function UpsellDialog({
  open,
  onClose,
  reason,
  flipbookId,
}: {
  open: boolean;
  onClose: () => void;
  reason: DenyReason | null;
  flipbookId: string | null;
}) {
  const { plans, config, me } = useSession();
  const instant = plans.find((p) => p.type === "instant");
  const cheapest = plans
    .filter((p) => p.type === "subscription")
    .reduce<number | null>((min, p) => (min === null || p.price < min ? p.price : min), null);
  const key = reason ?? "watermark";

  const intro =
    reason === "free_limit"
      ? `Free accounts get ${config?.freeDownloadLimit ?? 5} watermarked downloads. Pick one of these to keep going – both remove the watermark.`
      : reason === "plan_expired"
        ? "Renew to keep downloading. Your username, password and flipbooks stay the same."
        : reason === "plan_limit"
          ? "Upgrade to an unlimited plan, or buy a single download for this flipbook."
          : reason === "account_disabled"
            ? "Please contact us on WhatsApp."
            : "Get a clean flipbook with no watermark and no badge.";

  return (
    <Modal open={open} onClose={onClose} title={TITLES[key]}>
      <p className="text-[15px] text-ink-600">{intro}</p>
      {reason !== "account_disabled" && (
        <div className="mt-5 grid gap-3">
          <Link
            to="/pricing"
            onClick={onClose}
            className="group flex items-center gap-4 rounded-2xl border-2 border-brand-600 bg-brand-50/60 p-4 transition hover:bg-brand-50"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Crown className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink-900">
                {me?.customer ? "Choose a new plan" : "Subscribe"}
                {cheapest !== null && <span className="font-normal text-ink-600"> · from {formatINR(cheapest)}</span>}
              </span>
              <span className="block text-sm text-ink-600">No watermark on every flipbook, longer share links.</span>
            </span>
            <ArrowRight className="h-5 w-5 text-brand-600 transition group-hover:translate-x-0.5" aria-hidden />
          </Link>
          {instant && flipbookId && (
            <Link
              to={`/subscribe/${instant.code}?flipbook=${encodeURIComponent(flipbookId)}`}
              onClick={onClose}
              className="group flex items-center gap-4 rounded-2xl border border-ink-200 p-4 transition hover:border-ink-300 hover:bg-ink-50"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-700">
                <Zap className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink-900">
                  Instant download {formatINR(instant.price)}
                </span>
                <span className="block text-sm text-ink-600">This flipbook only, no watermark, no login needed.</span>
              </span>
              <ArrowRight className="h-5 w-5 text-ink-400 transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
          )}
        </div>
      )}
      <p className="mt-5 text-center text-sm text-ink-500">Pay on WhatsApp with any UPI app.</p>
    </Modal>
  );
}
