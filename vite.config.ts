import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackStart({
      router: {
        routeFileIgnorePattern: "\\.BACKUP\\.tsx$",
      },
      server: { entry: "server" },
    }),
    nitro({ preset: "node-server" }),
    react(),
    tailwindcss(),
  ],
  resolve: { tsconfigPaths: true },
});
