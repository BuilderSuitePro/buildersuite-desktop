import React, { useEffect, useState, useCallback, useRef } from "react";
import SettingsPanel from "./components/SettingsPanel.js";
import ProductForm from "./components/ProductForm.js";
import type {
  BspSettings,
  VerificationState,
  PendingCandidate,
  MessageResponse,
} from "../types/index.js";

// ─── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  app: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#f9f9f9",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  header: {
    background: "#ffffff",
    borderBottom: "1px solid #e8e8e8",
    padding: "8px 12px",
    display: "flex",
    alignItems: "center",
    gap: 0,
    flexShrink: 0,
    minHeight: 44,
  },
  logoMark: {
    width: 26,
    height: 26,
    objectFit: "contain",
    flexShrink: 0,
    marginRight: 7,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#2D2D2D",
    letterSpacing: 0.1,
    flexGrow: 1,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 2,
  },
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "5px 7px",
    borderRadius: 5,
    color: "#555",
    fontSize: 15,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
  },
  content: {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
  },
  menuDropdown: {
    position: "fixed" as const,
    right: 8,
    top: 44,
    background: "#fff",
    border: "1px solid #ddd",
    borderRadius: 6,
    boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
    zIndex: 9999,
    minWidth: 160,
    padding: "4px 0",
  },
  menuItem: {
    display: "block",
    width: "100%",
    textAlign: "left" as const,
    background: "none",
    border: "none",
    padding: "8px 14px",
    fontSize: 13,
    color: "#2D2D2D",
    cursor: "pointer",
  },
  menuDivider: {
    borderTop: "1px solid #eee",
    margin: "4px 0",
  },
  settingsView: {
    padding: "16px",
  },
  sitePickingBanner: {
    background: "#f8f6ef",
    borderBottom: "1px solid #e8d98a",
    padding: "7px 12px",
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexShrink: 0,
  },
  sitePickingBtnEnable: {
    fontSize: 11,
    padding: "3px 10px",
    background: "#2D2D2D",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  sitePickingBtnDisable: {
    fontSize: 11,
    padding: "3px 10px",
    background: "none",
    color: "#888",
    border: "1px solid #ccc",
    borderRadius: 4,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  restrictedBanner: {
    background: "#f5f5f5",
    borderBottom: "1px solid #ddd",
    padding: "7px 12px",
    fontSize: 12,
    color: "#888",
    flexShrink: 0,
  },
  loadError: {
    padding: "16px",
    color: "#c0392b",
    fontSize: 13,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRestrictedPage(url: string): boolean {
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("https://chrome.google.com/webstore") ||
    url.startsWith("about:") ||
    url === ""
  );
}

interface LoadedState {
  settings: BspSettings | null;
  verification: VerificationState | null;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<"capture" | "settings">("capture");
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [activeTabUrl, setActiveTabUrl] = useState<string>("");
  const [verification, setVerification] = useState<VerificationState | null>(null);
  const [hoverEnabled, setHoverEnabled] = useState(false);
  const [permissionPending, setPermissionPending] = useState(false);
  const [pendingCandidate, setPendingCandidate] = useState<PendingCandidate | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const refreshHoverState = useCallback((origin: string) => {
    if (!origin || isRestrictedPage(origin)) return;
    chrome.runtime.sendMessage(
      { type: "GET_HOVER_SITE_STATE", origin },
      (resp: MessageResponse<{ isEnabled: boolean }>) => {
        if (chrome.runtime.lastError || !resp?.ok) return;
        setHoverEnabled(resp.data.isEnabled);
      }
    );
  }, []);

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

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const tabId = tab?.id ?? null;
      const tabUrl = tab?.url ?? "";
      setActiveTabId(tabId);
      setActiveTabUrl(tabUrl);

      if (tabUrl && !isRestrictedPage(tabUrl)) {
        try {
          const origin = new URL(tabUrl).origin;
          refreshHoverState(origin);
        } catch {
          // ignore
        }
      }

      // Check for a pending candidate from a hover click
      chrome.runtime.sendMessage(
        { type: "GET_PENDING_CANDIDATE" },
        (resp: MessageResponse<{ candidate: PendingCandidate | null }>) => {
          if (chrome.runtime.lastError || !resp?.ok) return;
          if (resp.data.candidate) {
            setPendingCandidate(resp.data.candidate);
            chrome.runtime.sendMessage({ type: "CLEAR_PENDING_CANDIDATE" });
          }
        }
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [menuOpen]);

  const handleEnableHover = async () => {
    if (!activeTabUrl || isRestrictedPage(activeTabUrl)) return;
    let origin: string;
    try {
      origin = new URL(activeTabUrl).origin;
    } catch {
      return;
    }
    setPermissionPending(true);
    try {
      const granted = await new Promise<boolean>((resolve) => {
        chrome.permissions.request({ origins: [`${origin}/*`] }, resolve);
      });
      if (granted) {
        await new Promise<void>((resolve) => {
          chrome.runtime.sendMessage(
            { type: "ENABLE_HOVER_ON_SITE", origin },
            () => resolve()
          );
        });
        setHoverEnabled(true);
      }
    } finally {
      setPermissionPending(false);
    }
  };

  const handleDisableHover = async () => {
    if (!activeTabUrl || isRestrictedPage(activeTabUrl)) return;
    let origin: string;
    try {
      origin = new URL(activeTabUrl).origin;
    } catch {
      return;
    }
    await new Promise<void>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "DISABLE_HOVER_ON_SITE", origin },
        () => resolve()
      );
    });
    setHoverEnabled(false);
  };

  const isConnected = verification?.status === "verified";
  const bspOrigin = loaded?.settings?.bspOrigin ?? "";
  const restricted = isRestrictedPage(activeTabUrl);

  let currentOrigin = "";
  try {
    if (activeTabUrl && !restricted) {
      currentOrigin = new URL(activeTabUrl).origin;
    }
  } catch {
    // ignore
  }

  const logoUrl = typeof chrome !== "undefined"
    ? chrome.runtime.getURL("icons/bsp-logo.png")
    : "";

  return (
    <div style={S.app}>
      {/* ── Compact header ─────────────────────────────────────────────── */}
      <header style={S.header}>
        {logoUrl && (
          <img src={logoUrl} alt="" style={S.logoMark} aria-hidden="true" />
        )}
        <span style={S.headerTitle}>Product Picker</span>
        <div style={S.headerActions}>
          {/* Clear all — only in capture view */}
          {view === "capture" && (
            <button
              style={S.iconBtn}
              title="Clear all fields"
              type="button"
              onClick={() => {
                // Handled inside ProductForm via a ref/callback — for now navigate away and back
                // to trigger a reset; full Clear All with draft confirm is in ProductForm
                setPendingCandidate({ imageUrl: "__CLEAR__", sourceUrl: "", timestamp: Date.now(), tabId: 0 });
              }}
              aria-label="Clear all fields"
            >
              ✕
            </button>
          )}

          {/* ⋮ menu */}
          <div style={{ position: "relative" }} ref={menuRef}>
            <button
              style={S.iconBtn}
              title="More options"
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More options"
            >
              ⋮
            </button>

            {menuOpen && (
              <div style={S.menuDropdown}>
                <button
                  style={S.menuItem}
                  type="button"
                  onClick={() => {
                    setView("settings");
                    setMenuOpen(false);
                  }}
                >
                  Settings
                </button>
                <div style={S.menuDivider} />
                <button
                  style={{ ...S.menuItem, color: "#888", fontSize: 12 }}
                  type="button"
                  disabled
                >
                  Builder Suite Pro v1.1.0
                </button>
              </div>
            )}
          </div>

          {/* Back button when in settings */}
          {view === "settings" && (
            <button
              style={{ ...S.iconBtn, fontSize: 12, color: "#B8962E" }}
              type="button"
              onClick={() => setView("capture")}
              aria-label="Back to capture"
            >
              ← Back
            </button>
          )}
        </div>
      </header>

      {/* ── Per-site hover banner ──────────────────────────────────────── */}
      {view === "capture" && (
        restricted ? (
          <div style={S.restrictedBanner}>
            Page picking is unavailable here. Enter product details manually.
          </div>
        ) : currentOrigin ? (
          <div style={S.sitePickingBanner}>
            {hoverEnabled ? (
              <>
                <span style={{ color: "#555" }}>
                  <span style={{ color: "#1a6e2e" }}>✓</span>{" "}
                  Hover picking on <strong style={{ fontWeight: 600 }}>{currentOrigin}</strong>
                </span>
                <button
                  style={S.sitePickingBtnDisable}
                  onClick={handleDisableHover}
                  type="button"
                >
                  Disable
                </button>
              </>
            ) : (
              <>
                <span style={{ color: "#666" }}>
                  Enable hover picking on this site
                </span>
                <button
                  style={S.sitePickingBtnEnable}
                  onClick={handleEnableHover}
                  disabled={permissionPending}
                  type="button"
                >
                  {permissionPending ? "…" : "Enable"}
                </button>
              </>
            )}
          </div>
        ) : null
      )}

      {/* ── Main content ───────────────────────────────────────────────── */}
      <div style={S.content}>
        {loadError && (
          <div style={S.loadError}>{loadError}</div>
        )}

        {loaded !== null && (
          <>
            {view === "settings" && (
              <div style={S.settingsView}>
                <SettingsPanel
                  initialSettings={loaded.settings}
                  initialVerification={loaded.verification}
                />
              </div>
            )}

            {view === "capture" && (
              <ProductForm
                activeTabId={activeTabId}
                activeTabUrl={activeTabUrl}
                bspOrigin={bspOrigin}
                isConnected={isConnected}
                pendingCandidate={pendingCandidate}
                onCandidateConsumed={() => setPendingCandidate(null)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
