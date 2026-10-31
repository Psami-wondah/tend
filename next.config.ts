import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM + data files that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "@paypal/agent-toolkit"],
  // Keep the dev badge out of screenshots and the demo video.
  devIndicators: false,
};

export default nextConfig;
