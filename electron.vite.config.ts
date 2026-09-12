import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// The target is chosen at build time by the npm scripts (BSP_TARGET=suite|teams)
// and burned into the bundle here. A packaged app has no BSP_TARGET in its
// environment, so electron/targets.ts must never read it at runtime.
const target = process.env.BSP_TARGET === "teams" ? "teams" : "suite";
const define = { "process.env.BSP_TARGET": JSON.stringify(target) };

export default defineConfig({
  main: {
    define,
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "electron/main/index.ts") },
      },
    },
  },
  preload: {
    define,
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "electron/preload/index.ts") },
      },
    },
  },
  renderer: {
    define,
    root: resolve(__dirname, "src"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/index.html") },
      },
    },
  },
});
