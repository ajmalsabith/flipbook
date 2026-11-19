import { defineConfig } from "tsup";

// Bundles the server and ../shared into dist/. npm packages stay external
// and are loaded from node_modules at runtime.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
});
