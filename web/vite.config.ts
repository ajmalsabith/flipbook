import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  // The server's port comes from the repository's root .env.
  const rootEnv = loadEnv(mode, "..", "");
  const target = `http://localhost:${rootEnv.PORT || 4000}`;
  // Keep the browser's Host header so the server's same-origin check passes.
  const proxy = { target, changeOrigin: false };
  return {
    plugins: [react()],
    resolve: {
      alias: { "@shared": fileURLToPath(new URL("../shared", import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": proxy,
        "^/v/": proxy,
        "^/d/": proxy,
      },
    },
    preview: { port: 5173 },
    build: {
      target: "es2020",
      chunkSizeWarningLimit: 1600,
    },
  };
});
