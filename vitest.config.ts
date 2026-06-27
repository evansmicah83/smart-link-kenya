import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://test.supabase.co"),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("test-anon-key"),
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/lib/aaa2/__tests__/**/*.test.ts",
      "src/lib/provisioning3/__tests__/**/*.test.ts",
    ],
    setupFiles: [
      "src/lib/aaa2/__tests__/setup.ts",
      "src/lib/provisioning3/__tests__/setup.ts",
    ],
    alias: {
      "@/integrations/supabase/client": path.resolve(
        __dirname,
        "src/lib/provisioning3/__tests__/mocks/supabase-client.ts"
      ),
      "@/lib/network/drivers/mikrotik-rest": path.resolve(
        __dirname,
        "src/lib/aaa2/__tests__/mocks/mikrotik-rest.ts"
      ),
      "@/lib/network": path.resolve(
        __dirname,
        "src/lib/aaa2/__tests__/mocks/network.ts"
      ),
    },
  },
});
