import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

const ngrokDomains = [
  ".ngrok-free.dev",
  ".ngrok-free.app",
  ".ngrok.dev",
  ".ngrok.app",
];
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const shareHost =
    process.env.FORMA_SHARE_HOST?.trim() || env.FORMA_SHARE_HOST?.trim();
  const allowedHosts = [
    "localhost",
    ...ngrokDomains,
    ...(shareHost ? [shareHost] : []),
  ];
  const proxy = {
    "/api": {
      target: env.VITE_API_TARGET || "http://localhost:8787",
      changeOrigin: false,
      xfwd: true,
      ws: true,
    },
  };
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
    build: { outDir: "dist/client", emptyOutDir: true },
    server: {
      host: "0.0.0.0",
      port: 4175,
      strictPort: true,
      allowedHosts,
      proxy,
    },
    preview: { host: "0.0.0.0", port: 4175, allowedHosts, proxy },
  };
});
