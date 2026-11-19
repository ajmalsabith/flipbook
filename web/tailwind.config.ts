import type { Config } from "tailwindcss";
// Brand colours live in one file shared with the server: shared/theme.ts
import { colors } from "../shared/theme";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: colors.brand,
        accent: colors.accent,
        ink: colors.ink,
        logo: colors.logo,
        success: colors.success,
        danger: colors.danger,
        whatsapp: colors.whatsapp,
      },
      fontFamily: {
        sans: [
          '"Inter Variable"',
          "Inter",
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          "Roboto",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,.06), 0 8px 24px -12px rgba(15,23,42,.18)",
        lift: "0 2px 4px rgba(15,23,42,.06), 0 24px 48px -20px rgba(15,23,42,.30)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: { "fade-in": "fade-in .2s ease-out" },
    },
  },
  plugins: [],
} satisfies Config;
