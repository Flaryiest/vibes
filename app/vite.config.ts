import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: "localhost", port: 4747, strictPort: true },
  preview: { host: "localhost", port: 4747, strictPort: true },
  worker: { format: "es" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
