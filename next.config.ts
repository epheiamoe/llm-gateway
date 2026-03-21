import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  async rewrites() {
    return [
      // OpenAI-compatible: /v1/* → /api/v1/*
      {
        source: "/v1/:path*",
        destination: "/api/v1/:path*",
      },
      // Gemini-compatible: /v1beta/* → /api/v1/*
      {
        source: "/v1beta/:path*",
        destination: "/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
