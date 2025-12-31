import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      convex: path.resolve(__dirname, "./node_modules/convex"),
    },
    dedupe: ["react", "react-dom", "convex"],
  },
  // Ensure environment variables are available at build time
  define: {
    "import.meta.env.VITE_CONVEX_URL": JSON.stringify(
      process.env.VITE_CONVEX_URL || "https://intent-tiger-143.convex.cloud"
    ),
  },
});
