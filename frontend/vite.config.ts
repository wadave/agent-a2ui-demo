import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "esnext",
  },
  resolve: {
    dedupe: ["lit"],
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy /.well-known to backend for agent card discovery
      "/.well-known": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      // Proxy A2A JSON-RPC POST requests to backend
      "/a2a-rpc": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: () => "/",
      },
      // Proxy root POST (JSON-RPC) to backend
      "/": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        bypass(req) {
          // Only proxy POST requests (JSON-RPC), let GET serve frontend assets
          if (req.method !== "POST") return req.url;
        },
      },
    },
  },
});
