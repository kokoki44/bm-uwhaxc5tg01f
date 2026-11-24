import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60000,
  reporter: "list",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4173/" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run build && npx vite preview --port 4173 --strictPort", url: "http://localhost:4173/", timeout: 120000, reuseExistingServer: false },
});
