import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.LEDGER_API_URL ?? "http://127.0.0.1:8847"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
