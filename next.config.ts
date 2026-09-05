import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA
  },
  async rewrites() {
    return [
      {
        source: "/signal-dock/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*"
      },
      {
        source: "/signal-dock/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*"
      },
      {
        source: "/signal-dock/:path*",
        destination: "https://us.i.posthog.com/:path*"
      }
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.brandfetch.io",
        pathname: "/domain/**"
      }
    ]
  },
  experimental: {
    typedEnv: true
  },
  async headers() {
    const production = process.env.NODE_ENV === "production";
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : [])
      ] },
      ...["/", "/wireframes"].map((source) => ({ source, headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: [
          "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'self'",
          "form-action 'self'", "img-src 'self' https: data: blob:", "font-src 'self' https: data:",
          "style-src 'self' 'unsafe-inline'", `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"} https://challenges.cloudflare.com`,
          "connect-src 'self' https://challenges.cloudflare.com https://us.i.posthog.com https://us-assets.i.posthog.com",
          "frame-src 'self' https://challenges.cloudflare.com", ...(production ? ["upgrade-insecure-requests"] : [])
        ].join("; ") }
      ] }))
    ];
  },
  async redirects() {
    // Fixed same-host destination prevents Host/header-controlled redirects.
    // The deployment edge must own x-forwarded-proto; localhost is excluded.
    const configured = process.env.NEXT_PUBLIC_APP_URL;
    if (process.env.NODE_ENV !== "production" || !configured) return [];
    const origin = new URL(configured);
    if (origin.protocol !== "https:" || origin.username || origin.password || /^(localhost|127\.0\.0\.1)$/.test(origin.hostname)) return [];
    return [{ source: "/:path*", destination: `${origin.origin}/:path*`, permanent: true,
      has: [{ type: "host" as const, value: origin.hostname },
        { type: "header" as const, key: "x-forwarded-proto", value: "http" }] }];
  }
};

export default nextConfig;
