import { readFileSync } from "fs";
import { join } from "path";
import type { NextConfig } from "next";

const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as {
  version: string;
};

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_NEXUS_VERSION: pkg.version,
  },
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
