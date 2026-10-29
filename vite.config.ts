import { defineConfig } from "vite";

// The dev/preview server has to be reachable through the Arena preview proxy
// (https://<port>-<sandbox>.e2b.app), so it binds 0.0.0.0 and accepts any host.
export default defineConfig({
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
