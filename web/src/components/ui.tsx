import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Link, type LinkProps } from "react-router-dom";
import { AlertCircle, Check, CheckCircle2, Copy, Info, Loader2, X } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "whatsapp" | "dark";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800",
  secondary: "border border-ink-200 bg-white text-ink-800 shadow-sm hover:bg-ink-50 hover:border-ink-300",
  ghost: "text-ink-700 hover:bg-ink-100",
  danger: "bg-danger-600 text-white shadow-sm hover:bg-danger-700",
  whatsapp: "bg-whatsapp-600 text-white shadow-sm hover:bg-whatsapp-700",
  dark: "bg-ink-900 text-white shadow-sm hover:bg-ink-800",
};
const SIZES: Record<Size, string> = {
  sm: "h-9 gap-1.5 rounded-lg px-3 text-sm",
  md: "h-11 gap-2 rounded-xl px-4 text-[15px]",
  lg: "h-12 gap-2 rounded-xl px-6 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `inline-flex items-center justify-center font-semibold transition disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className = "", children, disabled, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  icon,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.05c-.24.68-1.42 1.32-1.97 1.37-.5.05-1.12.07-1.81-.11-.42-.13-.95-.31-1.64-.6-2.88-1.25-4.76-4.15-4.9-4.34-.14-.19-1.17-1.56-1.17-2.97 0-1.41.74-2.11 1-2.4.26-.28.57-.35.76-.35h.55c.18 0 .42-.07.65.5.24.58.81 2 .88 2.14.07.14.12.31.02.5-.09.19-.14.31-.28.47-.14.17-.3.37-.43.5-.14.14-.29.3-.12.58.16.28.73 1.2 1.57 1.95 1.08.96 1.99 1.26 2.27 1.4.28.14.45.12.61-.07.17-.19.71-.83.9-1.11.19-.28.38-.24.64-.14.26.09 1.66.78 1.94.92.28.14.47.21.54.33.07.12.07.68-.17 1.36Z" />
    </svg>
  );
}

export function WhatsAppButton({
  href,
  children = "Continue on WhatsApp",
  size = "lg",
  className = "",
}: {
  href: string;
  children?: ReactNode;
  size?: Size;
  className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClass("whatsapp", size, className)}>
      <WhatsAppIcon />
      {children}
    </a>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-brand-600 ${className}`} aria-label="Loading" />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

type AlertTone = "info" | "success" | "warning" | "error";
const ALERT: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: { box: "border-brand-100 bg-brand-50 text-brand-900", icon: <Info className="h-5 w-5 text-brand-600" /> },
  success: {
    box: "border-success-100 bg-success-50 text-success-700",
    icon: <CheckCircle2 className="h-5 w-5 text-success-600" />,
  },
  warning: {
    box: "border-accent-200 bg-accent-50 text-accent-700",
    icon: <AlertCircle className="h-5 w-5 text-accent-600" />,
  },
  error: {
    box: "border-danger-100 bg-danger-50 text-danger-700",
    icon: <AlertCircle className="h-5 w-5 text-danger-600" />,
  },
};

export function Alert({ tone = "info", title, children, className = "" }: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${ALERT[tone].box} ${className}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className="mt-0.5 shrink-0">{ALERT[tone].icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
    </div>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  prefix?: string;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, prefix, className = "", id, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="label">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[15px] text-ink-500">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`input ${prefix ? "pl-12" : ""} ${error ? "input-error" : ""}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-sm text-danger-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
          checked ? "bg-brand-600" : "bg-ink-200"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer text-[15px] leading-6 text-ink-800">
        {label}
        {hint && <span className="block text-sm text-ink-500">{hint}</span>}
      </label>
    </div>
  );
}

export function CopyButton({
  text,
  label = "Copy",
  size = "sm",
  variant = "secondary",
  className = "",
}: {
  text: string;
  label?: string;
  size?: Size;
  variant?: Variant;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <Button
      variant={variant}
      size={size}
      onClick={copy}
      icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      className={className}
      aria-live="polite"
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/** Accessible modal dialog built on <dialog>. */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`w-[calc(100%-2rem)] ${size === "lg" ? "max-w-2xl" : "max-w-lg"} rounded-2xl border-0 bg-white p-0 text-ink-800 shadow-lift backdrop:bg-ink-950/50 backdrop:backdrop-blur-sm`}
    >
      {open && (
        <div className="animate-fade-in p-6 sm:p-7">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-xl font-bold text-ink-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 -mt-1 rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-800"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "brand" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-ink-100 text-ink-700",
    brand: "bg-brand-50 text-brand-700",
    success: "bg-success-50 text-success-700",
    warning: "bg-accent-50 text-accent-700",
    danger: "bg-danger-50 text-danger-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-ink-100"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300" style={{ width: `${value}%` }} />
    </div>
  );
}
