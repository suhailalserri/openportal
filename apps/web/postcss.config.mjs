/**
 * PostCSS config for Tailwind CSS v4.
 * @tailwindcss/postcss replaces the old tailwindcss postcss plugin.
 *
 * NOTE: this must be .mjs (or .js/.cjs) — Next.js's built-in CSS pipeline
 * loads postcss config via postcss-load-config, which does not reliably
 * pick up a .ts file in all Next.js versions. A .ts config here can fail
 * to load silently, meaning Tailwind's plugin never runs and every
 * `@import "tailwindcss"` in globals.css ships unprocessed to production.
 */
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
