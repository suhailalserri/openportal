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
        mono:   ["JetBrains Mono", "monospace"],
      },
      colors: {
        // Design system tokens
        base:    { DEFAULT: "#0F172A", 50: "#1E293B" },
        surface: "#1E293B",
        border:  "#334155",
        accent: {
          blue: "#2563EB",
          teal: "#0F766E",
        },
      },
      animation: {
        "fade-in":   "fadeIn 0.2s ease-in-out",
        "slide-up":  "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" },                       "100%": { opacity: "1" } },
        slideUp: { "0%": { transform: "translateY(8px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
      },
    },
  },
  plugins: [typography],
} satisfies Config;
