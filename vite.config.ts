import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: "vercel",
  },
  vite: {
    resolve: {
      tsconfigPaths: true,
    },
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
