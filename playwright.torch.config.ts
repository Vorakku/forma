import { defineConfig, devices } from "@playwright/test";

// Focused V2 checks also run against the real offline demo without ../server.
export default defineConfig({
  testDir: "e2e",
  testMatch: "v2-scroll.spec.ts",
  timeout: 180_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:4177", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [{
    command: `"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4177 --strictPort`,
    url: "http://localhost:4177",
    reuseExistingServer: false,
    env: { VITE_API_TARGET: "http://127.0.0.1:1" },
  }, ...(process.env.COMPARE_TORCH_MAIN === "1" ? [{
    command: `"${process.execPath}" node_modules/vite/bin/vite.js --config e2e/helpers/v2-baseline.vite.ts --host 127.0.0.1 --port 4178 --strictPort`,
    url: "http://localhost:4178",
    reuseExistingServer: false,
    env: { VITE_API_TARGET: "http://127.0.0.1:1" },
  }] : [])],
});
