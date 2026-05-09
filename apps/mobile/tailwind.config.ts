import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Sentinel HR brand colours. Duplicated from
        // apps/web/tailwind.config.ts — shared Tailwind preset extraction
        // is deliberately deferred to Phase Mobile M5 (documents list,
        // when there's actually shared visual surface to justify the
        // abstraction). If you change a brand colour here, change it in
        // both files; the duplication is small enough at M2 scope to be
        // a worthwhile YAGNI trade.
        navy: "#0A2342",
        teal: "#0D9488",
      },
    },
  },
  plugins: [],
};

export default config;
