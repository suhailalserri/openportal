import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        arabic: ["IBM Plex Arabic", "sans-serif"],
        inter:  ["Inter", "sans-serif"],
        serif:  ["Source Serif 4", "Georgia", "serif"],
        mono:   ["JetBrains Mono", "monospace"],
      },
      colors: {
        // Design system tokens — mirrors the CSS custom properties in
        // globals.css so `bg-base` / `bg-surface` / `border-border` are
        // available as Tailwind utilities too, not just `bg-[var(--x)]`.
        base:    { DEFAULT: "#17130F", 50: "#1D1815" },
        surface: "#1D1815",
        border:  "#4A423B",
        accent: {
          blue: "#D97757",
          teal: "#CC8F35",
        },
      },
      animation: {
        "fade-in":   "fadeIn 0.2s ease-out",
        "slide-up":  "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" },                       "100%": { opacity: "1" } },
        slideUp: { "0%": { transform: "translateY(8px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
      },
    },
  },
  plugins: [typography],
} satisfies Config;
