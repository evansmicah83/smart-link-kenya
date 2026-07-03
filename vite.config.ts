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
      host: "127.0.0.1",
      port: 8080,
      hmr: {
        host: "127.0.0.1",
        port: 8080,
        clientPort: 8080,
        protocol: "ws",
      },
    },
  },
});
