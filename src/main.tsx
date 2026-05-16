import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// PWA guard: never register SW inside Lovable preview iframe (causes stale shells)
const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
const isPreviewHost = typeof window !== "undefined" && (
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com") ||
  window.location.hostname.includes("lovable.app")
);

if ("serviceWorker" in navigator) {
  if (inIframe || isPreviewHost || !import.meta.env.PROD) {
    // Clean up any previously-registered worker in preview/dev so refresh always works
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => undefined);
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
