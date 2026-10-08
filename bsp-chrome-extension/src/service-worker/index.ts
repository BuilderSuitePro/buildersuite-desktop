/**
 * Service Worker – message router for all privileged operations.
 *
 * Only messages originating from THIS extension's own contexts are processed.
 * Content scripts and web pages cannot trigger verification or access stored keys.
 */

import type {
  ExtensionMessage,
  MessageResponse,
  VerificationState,
  ExtractionResult,
  SaveApiResponse,
  DraftRecord,
  PendingCandidate,
} from "../types/index.js";
import {
  loadSettings,
  saveSettings,
  loadVerificationState,
  clearVerificationState,
  saveVerificationState,
  loadDraft,
  saveDraft,
  clearDraft,
  loadPendingSave,
  savePendingSave,
  clearPendingSave,
  loadPendingCandidate,
  savePendingCandidate,
  clearPendingCandidate,
  loadGrantedOrigins,
  addGrantedOrigin,
  removeGrantedOrigin,
  PENDING_CANDIDATE_KEY,
  loadAllSitesEnabled,
  saveAllSitesEnabled,
  clearAllSitesEnabled,
} from "./storage.js";
import { verifyConnection, saveProduct, ApiError } from "./api.js";

/** Returns true only for messages sent from this extension's own contexts. */
function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && sender.url !== undefined;
}

/**
 * Returns true for messages sent from content scripts on web pages.
 * Used only for HOVER_IMAGE_CLICKED which is allowed from content scripts.
 * Still validates extension ID match and that it's not a page-origin message.
 */
function isContentScriptSender(sender: chrome.runtime.MessageSender): boolean {
  return (
    sender.id === chrome.runtime.id &&
    sender.tab !== undefined &&
    sender.url !== undefined &&
    !sender.url.startsWith("chrome-extension://")
  );
}

/** In-flight save guard – prevents double-submit. */
let saveInFlight = false;

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    const msg = message as ExtensionMessage;

    // HOVER_IMAGE_CLICKED is handled SYNCHRONOUSLY here (not in async handleMessage)
    // so that chrome.sidePanel.open() is called while the user-gesture context is still
    // active. Any await before sidePanel.open loses the gesture context in Chrome MV3.
    if (msg.type === "HOVER_IMAGE_CLICKED") {
      if (!isContentScriptSender(sender)) {
        sendResponse({ ok: false, error: "Untrusted message sender" });
        return false;
      }

      const tabId = sender.tab?.id;
      if (!tabId) {
        sendResponse({ ok: false, error: "No tab context" });
        return false;
      }

      // Sanitize candidate data from untrusted page context (synchronous)
      const rawCandidate = msg.candidate as PendingCandidate;
      const candidate: PendingCandidate = {
        imageUrl: String(rawCandidate.imageUrl ?? "").slice(0, 8192),
        altText: rawCandidate.altText ? String(rawCandidate.altText).slice(0, 500) : undefined,
        sourceUrl: String(rawCandidate.sourceUrl ?? "").slice(0, 8192),
        cardLink: rawCandidate.cardLink ? String(rawCandidate.cardLink).slice(0, 8192) : undefined,
        cardTitle: rawCandidate.cardTitle ? String(rawCandidate.cardTitle).slice(0, 500) : undefined,
        cardPrice:
          typeof rawCandidate.cardPrice === "number" &&
          isFinite(rawCandidate.cardPrice) &&
          rawCandidate.cardPrice >= 0
            ? rawCandidate.cardPrice
            : undefined,
        timestamp: Date.now(),
        tabId,
        isDetailPage: Boolean(rawCandidate.isDetailPage),
      };

      // STEP 1: Open side panel FIRST — synchronously, before any async work.
      // Chrome considers this a user-gesture context because it was triggered by
      // a content-script message from a user click. This call MUST happen before
      // any await/Promise resolution or Chrome loses the gesture context.
      chrome.sidePanel.open({ tabId }).catch((err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[BSP] sidePanel.open failed:", errMsg);
        // Store error so the panel can display an actionable message
        chrome.storage.local.set({
          bsp_side_panel_error: { message: errMsg, timestamp: Date.now() },
        });
      });

      // STEP 2: Persist candidate (fire-and-forget — panel reads on mount)
      chrome.storage.local.set({ [PENDING_CANDIDATE_KEY]: candidate });

      sendResponse({ ok: true, data: { tabId } });
      return false;
    }

    if (!isTrustedSender(sender)) {
      sendResponse({ ok: false, error: "Untrusted message sender" });
      return false;
    }

    handleMessage(msg, sender, sendResponse);
    return true; // keep channel open for async response
  }
);

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  try {
    switch (message.type) {
      case "LOAD_SETTINGS": {
        const settings = await loadSettings();
        const verification = await loadVerificationState();
        sendResponse({ ok: true, data: { settings, verification } });
        break;
      }

      case "SAVE_SETTINGS": {
        await saveSettings(message.settings);
        await clearVerificationState();
        sendResponse({ ok: true, data: null });
        break;
      }

      case "VERIFY_CONNECTION": {
        const settings = await loadSettings();
        if (!settings) {
          sendResponse({ ok: false, error: "No settings saved yet" });
          break;
        }

        const verifying: VerificationState = { status: "verifying" };
        await saveVerificationState(verifying);

        try {
          const result = await verifyConnection(settings);
          const verified: VerificationState = {
            status: "verified",
            connectionName: result.connectionName,
            verifiedAt: result.verifiedAt,
          };
          await saveVerificationState(verified);
          sendResponse({ ok: true, data: verified });
        } catch (err) {
          const errMsg =
            err instanceof ApiError ? err.message : "Verification failed";
          const failed: VerificationState = {
            status: "failed",
            error: errMsg,
          };
          await saveVerificationState(failed);
          sendResponse({ ok: false, error: errMsg });
        }
        break;
      }

      case "CLEAR_VERIFICATION": {
        await clearVerificationState();
        sendResponse({ ok: true, data: null });
        break;
      }

      case "EXTRACT_PAGE": {
        const { tabId } = message;
        try {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              // Inline extraction call – content script must be injected already
              return new Promise<unknown>((resolve) => {
                chrome.runtime.sendMessage(
                  { type: "EXTRACT_PRODUCT" },
                  (resp) => {
                    resolve(resp);
                  }
                );
              });
            },
          });
          sendResponse({ ok: true, data: result.result as ExtractionResult });
        } catch (err) {
          // Tab may be a protected page
          const errMsg =
            err instanceof Error ? err.message : "Could not extract page";
          sendResponse({ ok: false, error: errMsg });
        }
        break;
      }

      case "SAVE_PRODUCT": {
        if (saveInFlight) {
          sendResponse({ ok: false, error: "Save already in progress" });
          break;
        }

        const settings = await loadSettings();
        if (!settings) {
          sendResponse({ ok: false, error: "No settings saved yet" });
          break;
        }

        saveInFlight = true;
        const { payload } = message;

        // Persist before sending (safe retry record)
        await savePendingSave({
          requestId: payload.requestId,
          product: payload.product,
          uploadIds: payload.uploadIds,
          timestamp: Date.now(),
        });

        try {
          const result: SaveApiResponse = await saveProduct(settings, payload);
          await clearPendingSave();
          saveInFlight = false;
          sendResponse({ ok: true, data: result });
        } catch (err) {
          saveInFlight = false;
          const statusCode =
            err instanceof ApiError ? err.statusCode : undefined;
          const errMsg =
            err instanceof ApiError ? err.message : "Save failed";

          // For unknown outcomes (network / 5xx), keep pending save for retry
          if (
            statusCode === undefined ||
            statusCode === 0 ||
            statusCode >= 500
          ) {
            // Leave pending save in storage for retry
            sendResponse({
              ok: false,
              error: `UNKNOWN:${errMsg}`,
            });
          } else {
            await clearPendingSave();
            sendResponse({ ok: false, error: errMsg });
          }
        }
        break;
      }

      case "LOAD_DRAFT": {
        const draft = await loadDraft();
        const pending = await loadPendingSave();
        sendResponse({ ok: true, data: { draft, pending } });
        break;
      }

      case "SAVE_DRAFT": {
        await saveDraft(message.draft as DraftRecord);
        sendResponse({ ok: true, data: null });
        break;
      }

      case "CLEAR_DRAFT": {
        await clearDraft();
        sendResponse({ ok: true, data: null });
        break;
      }

      // HOVER_IMAGE_CLICKED is intercepted and handled synchronously in the onMessage
      // listener BEFORE handleMessage is called (to preserve the user-gesture context
      // for sidePanel.open). This case should never execute at runtime, but we keep it
      // for TypeScript exhaustiveness.
      case "HOVER_IMAGE_CLICKED": {
        sendResponse({ ok: false, error: "Handled in message listener" });
        break;
      }

      case "ENABLE_HOVER_ON_SITE": {
        const { origin } = message;
        await addGrantedOrigin(origin);

        // Notify content scripts on tabs with this origin
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (!tab.id || !tab.url) continue;
          try {
            const tabOrigin = new URL(tab.url).origin;
            if (tabOrigin === origin) {
              chrome.tabs.sendMessage(tab.id, { type: "ENABLE_HOVER" }).catch(() => {
                // Tab may not have content script — ignore
              });
            }
          } catch {
            // ignore invalid URLs
          }
        }

        sendResponse({ ok: true, data: null });
        break;
      }

      case "DISABLE_HOVER_ON_SITE": {
        const { origin: disableOrigin } = message;
        await removeGrantedOrigin(disableOrigin);

        // Notify content scripts
        const disableTabs = await chrome.tabs.query({});
        for (const tab of disableTabs) {
          if (!tab.id || !tab.url) continue;
          try {
            const tabOrigin = new URL(tab.url).origin;
            if (tabOrigin === disableOrigin) {
              chrome.tabs.sendMessage(tab.id, { type: "DISABLE_HOVER" }).catch(() => {
                // ignore
              });
            }
          } catch {
            // ignore
          }
        }

        // Revoke the optional host permission
        try {
          await chrome.permissions.remove({ origins: [disableOrigin + "/*"] });
        } catch {
          // ignore – permission may not exist as optional
        }

        sendResponse({ ok: true, data: null });
        break;
      }

      case "GET_HOVER_SITE_STATE": {
        // Return true if all-sites is enabled OR if this specific origin was granted
        const allSites = await loadAllSitesEnabled();
        if (allSites) {
          // Verify permission is still actually granted (user may have revoked it externally)
          const hasPermission = await chrome.permissions.contains({
            origins: ["http://*/*", "https://*/*"],
          });
          if (hasPermission) {
            sendResponse({ ok: true, data: { isEnabled: true } });
            break;
          }
          // Permission was revoked — clean up the stale flag
          await clearAllSitesEnabled();
        }
        const origins = await loadGrantedOrigins();
        const isEnabled = origins.has(message.origin);
        sendResponse({ ok: true, data: { isEnabled } });
        break;
      }

      case "GET_PENDING_CANDIDATE": {
        const candidate = await loadPendingCandidate();
        sendResponse({ ok: true, data: { candidate } });
        break;
      }

      case "CLEAR_PENDING_CANDIDATE": {
        await clearPendingCandidate();
        sendResponse({ ok: true, data: null });
        break;
      }

      case "PANEL_READY": {
        // Panel just mounted — check if there's a pending candidate it should receive.
        // This is the secondary delivery mechanism; the panel also reads storage directly on mount.
        const pendingForPanel = await loadPendingCandidate();
        sendResponse({ ok: true, data: { candidate: pendingForPanel ?? null } });
        break;
      }

      case "ENABLE_ALL_SITES": {
        await saveAllSitesEnabled(true);

        // Register content script for persistent all-sites injection (survives SW restart)
        await registerAllSitesContentScript();

        // Enable hover on all currently-open web tabs immediately
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) {
          if (!tab.id || !tab.url) continue;
          if (!tab.url.startsWith("http://") && !tab.url.startsWith("https://")) continue;
          chrome.tabs.sendMessage(tab.id, { type: "ENABLE_HOVER" }).catch(() => {
            // Tab may not have content script yet; dynamic injection for already-open tabs
            chrome.scripting.executeScript({
              target: { tabId: tab.id as number, allFrames: false },
              files: ["src/content/extract.ts"],
            }).then(() => {
              chrome.tabs.sendMessage(tab.id as number, { type: "ENABLE_HOVER" }).catch(() => {});
            }).catch(() => {});
          });
        }

        sendResponse({ ok: true, data: null });
        break;
      }

      case "DISABLE_ALL_SITES": {
        await clearAllSitesEnabled();

        // Revoke the all-sites optional host permissions
        try {
          await chrome.permissions.remove({ origins: ["http://*/*", "https://*/*"] });
        } catch {
          // ignore — permission may already be absent
        }

        // Unregister the dynamically-registered content script
        try {
          await chrome.scripting.unregisterContentScripts({ ids: ["bsp-hover-all-sites"] });
        } catch {
          // ignore — may not have been registered
        }

        // Disable hover on all open tabs
        const disableTabs = await chrome.tabs.query({});
        for (const tab of disableTabs) {
          if (!tab.id) continue;
          chrome.tabs.sendMessage(tab.id, { type: "DISABLE_HOVER" }).catch(() => {});
        }

        sendResponse({ ok: true, data: null });
        break;
      }

      case "GET_ALL_SITES_STATE": {
        const enabled = await loadAllSitesEnabled();
        if (!enabled) {
          sendResponse({ ok: true, data: { allSitesEnabled: false } });
          break;
        }
        // Verify the permission is still actually granted
        const stillGranted = await chrome.permissions.contains({
          origins: ["http://*/*", "https://*/*"],
        });
        if (!stillGranted) {
          await clearAllSitesEnabled();
          sendResponse({ ok: true, data: { allSitesEnabled: false } });
          break;
        }
        sendResponse({ ok: true, data: { allSitesEnabled: true } });
        break;
      }

      default: {
        const _exhaustive: never = message;
        void _exhaustive;
        sendResponse({ ok: false, error: "Unknown message type" });
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Internal error";
    sendResponse({ ok: false, error: errMsg });
  }
}

/** Registers the content script for all HTTP/HTTPS origins (idempotent). */
async function registerAllSitesContentScript(): Promise<void> {
  try {
    await chrome.scripting.registerContentScripts([
      {
        id: "bsp-hover-all-sites",
        matches: ["http://*/*", "https://*/*"],
        js: ["src/content/extract.ts"],
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
  } catch (err) {
    // Chrome throws if a script with the same id is already registered — that's OK
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("Duplicate script ID") && !msg.includes("already registered")) {
      console.warn("[BSP] registerContentScripts failed:", msg);
    }
  }
}

// ─── Service worker startup ───────────────────────────────────────────────────

// On SW startup, re-register the all-sites content script if the user previously
// granted the all-sites permission. Service workers restart frequently in MV3.
chrome.runtime.onInstalled.addListener(() => {
  restoreAllSitesRegistrationIfGranted();
});

// Also re-register on any SW startup (onInstalled only fires on install/update)
(async () => {
  await restoreAllSitesRegistrationIfGranted();
})();

async function restoreAllSitesRegistrationIfGranted(): Promise<void> {
  const enabled = await loadAllSitesEnabled();
  if (!enabled) return;

  const granted = await chrome.permissions.contains({
    origins: ["http://*/*", "https://*/*"],
  });
  if (granted) {
    await registerAllSitesContentScript();
  } else {
    // Permission was revoked externally — clear the stale flag
    await clearAllSitesEnabled();
  }
}

// Open the side panel when the action button is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) {
    chrome.sidePanel
      .open({ tabId: tab.id })
      .catch((err: unknown) =>
        console.error("[BSP] Failed to open side panel:", err)
      );
  }
});

// Re-enable hover on tabs that load pages from granted origins.
// Top-level listener registration required for MV3 service worker restarts.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url) return;

  let tabOrigin: string;
  try {
    tabOrigin = new URL(tab.url).origin;
  } catch {
    return;
  }

  // Only bother reading storage if the URL looks like a web page
  if (!tab.url.startsWith("https://") && !tab.url.startsWith("http://")) return;

  loadAllSitesEnabled()
    .then((allSites) => {
      if (allSites) {
        chrome.tabs.sendMessage(tabId, { type: "ENABLE_HOVER" }).catch(() => {
          // Content script may not be running yet — dynamic registration will handle it
        });
        return;
      }
      return loadGrantedOrigins().then((origins) => {
        if (origins.has(tabOrigin)) {
          chrome.tabs.sendMessage(tabId, { type: "ENABLE_HOVER" }).catch(() => {
            // Content script not yet ready — it will self-activate from storage on init
          });
        }
      });
    })
    .catch(() => {
      // storage read failure — ignore
    });
});

// When optional host permissions are removed (e.g. via chrome://extensions),
// clear the allSitesEnabled flag so the panel prompts again.
chrome.permissions.onRemoved.addListener((permissions) => {
  const removedOrigins = permissions.origins ?? [];
  const allSitesPatterns = ["http://*/*", "https://*/*"];
  const removedAllSites = allSitesPatterns.some((p) => removedOrigins.includes(p));
  if (removedAllSites) {
    clearAllSitesEnabled().catch(() => {});
  }
});

// When new optional permissions are granted (e.g. via panel → Enable picking),
// ensure any tabs already on that origin get hover enabled.
chrome.permissions.onAdded.addListener((permissions) => {
  const newOrigins = permissions.origins ?? [];
  for (const pattern of newOrigins) {
    // pattern is like "https://example.com/*"
    let origin: string;
    try {
      origin = new URL(pattern.replace(/\/\*$/, "/")).origin;
    } catch {
      continue;
    }

    addGrantedOrigin(origin).catch(() => {
      // ignore storage error
    });
  }
});
