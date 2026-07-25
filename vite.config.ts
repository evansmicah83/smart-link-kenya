import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import fs from "fs";
import path from "path";

// Stamps the deploy timestamp into sw.js so the cache key busts on every build.
function swCacheBustPlugin() {
  return {
    name: "sw-cache-bust",
    closeBundle() {
      const ts = Date.now();
      const swPath = path.resolve(__dirname, ".vercel/output/static/sw.js");
      if (!fs.existsSync(swPath)) return;
      const content = fs.readFileSync(swPath, "utf-8");
      fs.writeFileSync(swPath, content.replace("__DEPLOY_TS__", String(ts)));
    },
  };
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: "vercel",
  },
  vite: {
    plugins: [swCacheBustPlugin()],
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
