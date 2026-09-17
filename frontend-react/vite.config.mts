import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "frontend-react",
  envDir: "..",
  plugins: [react()],
  build: { outDir: "../frontend-dist", emptyOutDir: true },
  server: { port: 5173, proxy: { "/api": "http://localhost:5000" } },
});
