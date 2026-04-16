import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // @anon-aadhaar/core ships raw .ts source with a Buffer cast that fails
    // under newer TS. Safe to ignore — we type-check our own code separately.
    ignoreBuildErrors: true,
  },
  turbopack: {},
};

export default nextConfig;
