// amflipbook brand theme: the ONLY place brand colours are defined.
//
// Used by:
//  - web/tailwind.config.ts      (classes such as bg-brand-600, text-ink-700)
//  - shared/flipbook viewer      (buttons and slider in share links and downloads)
//  - server pages and images     (expired page, preview cards, watermark)
//
// The colours come from the logo (web/public/brand/logo.svg): its blue is the
// main brand colour, its orange the accent, and `logo` holds all four shapes'
// colours for decoration. `brand.600` is the main button colour, `brand.700`
// its hover state, `brand.50`-`brand.100` light backgrounds.

export const brandName = "amflipbook";

/**
 * Public URL of the logo (file: web/public/brand/logo.svg). If you switch to
 * a PNG, change this, BRAND_LOGO_PATH in .env and the icon in web/index.html.
 */
export const brandLogoUrl = "/brand/logo.svg";

export const colors = {
  brand: {
    50: "#eef5ff",
    100: "#d9e8ff",
    200: "#bcd7ff",
    300: "#8ebeff",
    400: "#5999ff",
    500: "#3373ff",
    600: "#0b5cff",
    700: "#0645d8",
    800: "#0b39ad",
    900: "#103488",
    950: "#0d2152",
  },
  accent: {
    50: "#fff8eb",
    100: "#ffecc6",
    200: "#ffd788",
    300: "#ffbd4a",
    400: "#ffa620",
    500: "#f98a07",
    600: "#dd6502",
    700: "#b74306",
  },
  // The four shapes of the logo.
  logo: {
    orange: "#ffa200",
    red: "#ff3d0a",
    blue: "#0b5cff",
    green: "#00a05a",
  },
  // Neutral greys for text, borders and backgrounds.
  ink: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    950: "#020617",
  },
  success: { 50: "#ecfdf5", 100: "#d1fae5", 600: "#059669", 700: "#047857" },
  danger: { 50: "#fef2f2", 100: "#fee2e2", 600: "#dc2626", 700: "#b91c1c" },
  whatsapp: { 500: "#25d366", 600: "#1fb855", 700: "#128c7e" },
} as const;

/** Colours used inside the flipbook viewer (share links and downloads). */
export const viewerColors = {
  accent: colors.brand[600],
  accentHover: colors.brand[700],
  text: colors.ink[800],
  muted: colors.ink[500],
  backgroundCenter: "#ffffff",
  backgroundMid: colors.ink[100],
  backgroundEdge: colors.ink[200],
};
