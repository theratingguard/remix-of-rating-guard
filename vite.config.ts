import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "public",
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    nitro({
      preset: "node-server",
      routeRules: {
        "/assets/**": {
          headers: { "cache-control": "public, max-age=31536000, immutable" },
        },
        "/logo.svg": {
          headers: { "cache-control": "public, max-age=86400, stale-while-revalidate=604800" },
        },
        "/favicon*": {
          headers: { "cache-control": "public, max-age=86400, stale-while-revalidate=604800" },
        },
        "/apple-touch-icon.png": {
          headers: { "cache-control": "public, max-age=86400, stale-while-revalidate=604800" },
        },
        "/sw.js": {
          headers: { "cache-control": "no-cache, no-store, must-revalidate" },
        },
      },
    }),
    react(),
    tailwindcss(),
  ],
  build: {
    copyPublicDir: true,
    cssCodeSplit: true,
    cssMinify: true,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: ["log", "info", "debug"],
        drop_debugger: true,
      },
    },
  },
  resolve: { tsconfigPaths: true },
});
