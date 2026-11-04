"use client";

import { useEffect, type ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    function applyTokens() {
      try {
        const raw = localStorage.getItem("calvin-theme-config");
        if (!raw) return;
        const config = JSON.parse(raw);
        const root = document.documentElement;

        if (config.primaryColor) {
          root.style.setProperty("--red", config.primaryColor);
        }
        if (config.secondaryColor) {
          root.style.setProperty("--red-dark", config.secondaryColor);
        }
        if (config.backgroundColor) {
          root.style.setProperty("--paper", config.backgroundColor);
        }
        if (config.textColor) {
          root.style.setProperty("--ink", config.textColor);
        }
        if (config.fontFamily) {
          root.style.setProperty(
            "--font-body",
            `"${config.fontFamily}", Arial, sans-serif`
          );
        }
      } catch {
        // Fallback to default styles
      }
    }

    applyTokens();
    window.addEventListener("storage", applyTokens);
    window.addEventListener("calvin-theme-updated", applyTokens);

    return () => {
      window.removeEventListener("storage", applyTokens);
      window.removeEventListener("calvin-theme-updated", applyTokens);
    };
  }, []);

  return <>{children}</>;
}

