import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { resolveDeployment } from "./src/lib/deployment.ts";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = path.resolve(import.meta.dirname, "..");
  const env = { ...loadEnv(mode, envDir, "VITE_"), ...process.env };
  resolveDeployment(env.VITE_CONVEX_URL, env.VITE_CONVEX_SITE_URL);
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
        react: path.resolve(import.meta.dirname, "./node_modules/react"),
        "react-dom": path.resolve(
          import.meta.dirname,
          "./node_modules/react-dom",
        ),
        convex: path.resolve(import.meta.dirname, "./node_modules/convex"),
      },
      dedupe: ["react", "react-dom", "convex"],
    },
    // Convex CLI writes the deployment configuration at the repository root.
    envDir,
  };
});
