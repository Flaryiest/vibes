import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "localhost",
    port: 4747,
    strictPort: true,
    // The local server (songs, saved notes, backups) runs on 4748 during development.
    proxy: { "/songs": "http://127.0.0.1:4748", "/api": "http://127.0.0.1:4748" },
  },
  preview: { host: "localhost", port: 4747, strictPort: true },
  worker: { format: "es" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
