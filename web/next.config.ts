import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../.env") });

const nextConfig: NextConfig = {
  transpilePackages: [
    "@coding-agent-harness/core",
    "@coding-agent-harness/sandbox",
    "@coding-agent-harness/tools",
  ],
  serverExternalPackages: ["@vercel/sandbox"],
};

export default nextConfig;
