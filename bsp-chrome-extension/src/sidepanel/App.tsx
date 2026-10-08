import React, { useEffect, useState } from "react";
import SettingsPanel from "./components/SettingsPanel.js";
import type { BspSettings, VerificationState } from "../types/index.js";
import type { MessageResponse } from "../types/index.js";

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#ffffff",
  },
  header: {
    background: "#2D2D2D",
    color: "#ffffff",
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderBottom: "3px solid #B8962E",
    flexShrink: 0,
  },
  logo: {
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: 0.3,
    color: "#B8962E",
  },
  subtitle: {
    fontSize: 11,
    color: "#aaa",
    marginTop: 1,
  },
  headerText: {
    display: "flex",
    flexDirection: "column",
  },
  content: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
  },
  stage2Placeholder: {
    marginTop: 24,
    padding: "12px 14px",
    background: "#f8f8f8",
    borderRadius: 6,
    border: "1px dashed #ccc",
    color: "#888",
    fontSize: 12,
    textAlign: "center",
  },
};

interface LoadedState {
  settings: BspSettings | null;
  verification: VerificationState | null;
}

export default function App() {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "LOAD_SETTINGS" },
      (response: MessageResponse<{ settings: BspSettings | null; verification: VerificationState | null }>) => {
        if (chrome.runtime.lastError) {
          setLoadError(chrome.runtime.lastError.message ?? "Failed to load settings");
          return;
        }
        if (!response.ok) {
          setLoadError(response.error);
          return;
        }
        setLoaded(response.data);
      }
    );
  }, []);

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.headerText}>
          <span style={styles.logo}>Builder Suite Pro</span>
          <span style={styles.subtitle}>Product Picker</span>
        </div>
      </header>

      <div style={styles.content}>
        {loadError && (
          <div style={{ color: "#c0392b", marginBottom: 12, fontSize: 13 }}>
            {loadError}
          </div>
        )}

        {loaded !== null && (
          <SettingsPanel
            initialSettings={loaded.settings}
            initialVerification={loaded.verification}
          />
        )}

        <div style={styles.stage2Placeholder}>
          Stage 2: Product capture form will appear here
        </div>
      </div>
    </div>
  );
}
