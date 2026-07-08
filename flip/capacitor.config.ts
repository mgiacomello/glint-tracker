import type { CapacitorConfig } from "@capacitor/cli";

/**
 * FLIP — native shell (Capacitor).
 *
 * Strategy: the native app loads the hosted Next.js app (Render), so the AI
 * stays server-side and the same codebase powers web + iOS + Android.
 * The in-webview camera (getUserMedia) works on both platforms with the
 * permissions declared below — no extra plugin needed for the scanner / FLIP Eyes.
 *
 * Set FLIP_APP_URL to your deployed URL before `npx cap sync`.
 */
const config: CapacitorConfig = {
  appId: "info.chiaro.app",
  appName: "Chiaro",
  webDir: "public", // placeholder; real content is served from server.url
  server: {
    url: process.env.FLIP_APP_URL || "https://chiaro.onrender.com",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
  backgroundColor: "#eef2f8",
};

export default config;
