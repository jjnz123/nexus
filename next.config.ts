import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // Allow large meeting audio uploads through /api/uploads (default is 10MB).
    middlewareClientMaxBodySize: "200mb",
  },
  images: {
    remotePatterns: [],
    unoptimized: true,
  },
};

export default nextConfig;
