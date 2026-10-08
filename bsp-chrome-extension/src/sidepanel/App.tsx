import React, { useEffect, useState } from "react";
import SettingsPanel from "./components/SettingsPanel.js";
import ProductForm from "./components/ProductForm.js";
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
  tabBar: {
    display: "flex",
    borderBottom: "2px solid #eee",
    marginBottom: 12,
    gap: 0,
  },
  tab: {
    flex: 1,
    padding: "7px 0",
    textAlign: "center",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    background: "none",
    color: "#888",
    borderBottom: "2px solid transparent",
    marginBottom: -2,
  },
  tabActive: {
    color: "#B8962E",
    borderBottom: "2px solid #B8962E",
  },
};

type Tab = "capture" | "settings";

interface LoadedState {
  settings: BspSettings | null;
  verification: VerificationState | null;
}

export default function App() {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("capture");
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [activeTabUrl, setActiveTabUrl] = useState<string>("");
  const [verification, setVerification] = useState<VerificationState | null>(null);

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
        setVerification(response.data.verification);
      }
    );

    // Get the active tab info
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id) setActiveTabId(tab.id);
      if (tab?.url) setActiveTabUrl(tab.url);
    });
  }, []);

  const isConnected = verification?.status === "verified";
  const bspOrigin = loaded?.settings?.bspOrigin ?? "";

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
          <>
            {/* Tab bar */}
            <div style={styles.tabBar}>
              <button
                style={{
                  ...styles.tab,
                  ...(activeTab === "capture" ? styles.tabActive : {}),
                }}
                onClick={() => setActiveTab("capture")}
              >
                Capture
              </button>
              <button
                style={{
                  ...styles.tab,
                  ...(activeTab === "settings" ? styles.tabActive : {}),
                }}
                onClick={() => setActiveTab("settings")}
              >
                Settings
              </button>
            </div>

            {activeTab === "settings" && (
              <SettingsPanel
                initialSettings={loaded.settings}
                initialVerification={loaded.verification}
              />
            )}

            {activeTab === "capture" && (
              <ProductForm
                activeTabId={activeTabId}
                activeTabUrl={activeTabUrl}
                bspOrigin={bspOrigin}
                isConnected={isConnected}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
