import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Big libraries get their own chunks so the app chunk stays small and
// vendor code stays cached between deploys.
const vendorGroups = [
  { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
  { name: "router", test: /node_modules[\\/]@tanstack[\\/]/ },
  { name: "supabase", test: /node_modules[\\/]@supabase[\\/]/ },
  { name: "stripe", test: /node_modules[\\/]@stripe[\\/]/ },
];

export default defineConfig({
  root: "frontend-react",
  envDir: "..",
  plugins: [react()],
  build: {
    outDir: "../frontend-dist",
    emptyOutDir: true,
    rolldownOptions: { output: { codeSplitting: { groups: vendorGroups } } },
  },
  server: { port: 5173, proxy: { "/api": "http://localhost:5000" } },
});
