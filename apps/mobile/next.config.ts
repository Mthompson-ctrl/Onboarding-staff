import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static-export bundle wrapped by Capacitor. No SSR, no Server Actions —
  // `next build` produces an `out/` directory which Capacitor copies into
  // the native shells via `npx cap sync`.
  output: "export",

  // Static export cannot use Next's image optimisation pipeline (no server
  // to do the work). Components must use plain <img> or accept Next's
  // unoptimised pass-through.
  images: { unoptimized: true },

  // Internal monorepo package — Next compiles its raw .ts source via the
  // bundler. No build step / dist output in packages/shared; consumers
  // import directly from "@sentinel/shared/<subpath>" and the exports
  // map (packages/shared/package.json) resolves to ./src/<subpath>.ts.
  transpilePackages: ["@sentinel/shared"],
};

export default nextConfig;
