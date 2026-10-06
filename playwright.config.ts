import { defineConfig, devices } from "@playwright/test";

// Always rebuild commerce_e2e from the two-store seed; never use the development database.
try {
  process.loadEnvFile("../server/.env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
process.env.DEV_ADMIN_EMAIL ??= "admin@example.test";
process.env.DEV_ADMIN_PASSWORD ??= "development-admin-password";
const API = "http://localhost:8788";
const APP = "http://localhost:4176";

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: APP,
    trace: "retain-on-failure",
    screenshot:
      process.env.CAPTURE_SCREENSHOTS === "1" ? "only-on-failure" : "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run e2e:server",
      cwd: "../server",
      url: `${API}/api/health`,
      // Always a fresh database: never reuse a server holding old state.
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, PORT: "8788" } as Record<string, string>,
    },
    {
      command: "npx vite --host 127.0.0.1 --port 4176 --strictPort",
      url: APP,
      reuseExistingServer: false,
      env: {
        ...process.env,
        VITE_API_TARGET: API,
        VITE_STORE_KEY: "pk_forma_dev",
      } as Record<string, string>,
    },
  ],
});
