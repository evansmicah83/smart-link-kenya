import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server", preset: "vercel-edge" },
  },
  vite: {
    build: {
      chunkSizeWarningLimit: 1500,
    },
    server: {
      port: 8080,
      hmr: {
        port: 8080,
        host: "localhost",
        protocol: "ws",
      },
    },
  },
});
