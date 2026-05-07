import type { NextConfig } from "next";

// In a GitHub Codespace, requests reach Next via a port-forwarding proxy.
// The browser's Origin header arrives as `localhost:3000` (the tunnelled
// port the Codespaces extension exposes locally), while the proxy adds
// `x-forwarded-host` set to the public Codespace URL. Next's Server
// Actions CSRF check compares Origin against host/x-forwarded-host and
// aborts when they don't line up — so we whitelist both ends of the
// proxy here.
//
// Outside Codespaces, CODESPACE_NAME is unset, allowedOrigins resolves
// to undefined, and Next falls back to its default same-origin
// enforcement. Production behaviour is unaffected.
const codespaceAllowedOrigins =
  process.env.CODESPACE_NAME &&
  process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? [
        `${process.env.CODESPACE_NAME}-3000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`,
        "localhost:3000",
      ]
    : undefined;

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: codespaceAllowedOrigins,
    },
  },
};

export default nextConfig;
