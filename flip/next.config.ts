import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin the workspace root: stray lockfiles in parent dirs otherwise mislead Turbopack.
  turbopack: {
    root: projectRoot,
  },
  // Keep these out of the bundle: required from node_modules at runtime (native/worker deps).
  serverExternalPackages: ["pdf-parse", "tesseract.js"],
};

export default nextConfig;
