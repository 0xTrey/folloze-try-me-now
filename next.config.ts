import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
  }
};

export default nextConfig;
