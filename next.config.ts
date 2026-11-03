import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-rendered app — API routes + future Supabase integration.
  // (Static export config was inherited from the Electron template; removed.)
  // Standalone output: self-contained server bundle for the Dockerfile
  // (Railway/Render/Fly) — no node_modules needed at runtime.
  output: "standalone",
};

export default nextConfig;
