import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Same setting as the original project (it deployed fine with it).
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
