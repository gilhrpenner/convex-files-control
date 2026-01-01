import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import "./index.css";
import App from "./App.tsx";
import { DownloadPage } from "./pages/DownloadPage.tsx";

const convexUrl = import.meta.env.VITE_CONVEX_URL || "https://intent-tiger-143.convex.cloud";

if (!convexUrl || typeof convexUrl !== "string" || convexUrl.trim() === "") {
  console.error("VITE_CONVEX_URL is not set or invalid:", convexUrl);
  throw new Error("VITE_CONVEX_URL is required. Please set it in your environment variables.");
}

const convex = new ConvexReactClient(convexUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/download" element={<DownloadPage />} />
        </Routes>
      </BrowserRouter>
    </ConvexAuthProvider>
  </StrictMode>,
);
