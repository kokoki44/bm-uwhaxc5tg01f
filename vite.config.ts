import { defineConfig } from "vitest/config";

// base "./" damit dieselbe Web-Version unter jeder Pages-Adresse (Unterpfad) und in Tauri läuft.
export default defineConfig({
  base: "./",
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  server: { port: 5173, strictPort: true },
  test: {
    // Leistungstests laufen allein nach den übrigen Tests (scripts/test.mjs), damit parallele Testdateien nicht mitmessen
    include: process.env.LEISTUNG ? ["tests/**/*.leistung.ts"] : ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
  },
});
