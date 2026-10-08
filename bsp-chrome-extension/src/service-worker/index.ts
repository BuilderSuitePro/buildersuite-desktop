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

    // HOVER_IMAGE_CLICKED is allowed from content scripts (not from page scripts)
    if (msg.type === "HOVER_IMAGE_CLICKED") {
      if (!isContentScriptSender(sender)) {
        sendResponse({ ok: false, error: "Untrusted message sender" });
        return false;
      }
      handleMessage(msg, sender, sendResponse);
      return true;
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

      case "HOVER_IMAGE_CLICKED": {
        // Validate: sender must be a content script (checked before entering this handler)
        const tabId = sender.tab?.id;
        if (!tabId) {
          sendResponse({ ok: false, error: "No tab context" });
          break;
        }

        // Validate candidate data is safe (page-derived, untrusted)
        const rawCandidate = message.candidate as PendingCandidate;
        const candidate: PendingCandidate = {
          imageUrl: String(rawCandidate.imageUrl ?? "").slice(0, 8192),
          altText: rawCandidate.altText ? String(rawCandidate.altText).slice(0, 500) : undefined,
          sourceUrl: String(rawCandidate.sourceUrl ?? "").slice(0, 8192),
          cardLink: rawCandidate.cardLink ? String(rawCandidate.cardLink).slice(0, 8192) : undefined,
          cardTitle: rawCandidate.cardTitle ? String(rawCandidate.cardTitle).slice(0, 500) : undefined,
          cardPrice: typeof rawCandidate.cardPrice === "number" && isFinite(rawCandidate.cardPrice) && rawCandidate.cardPrice >= 0
            ? rawCandidate.cardPrice
            : undefined,
          timestamp: Date.now(),
          tabId,
          isDetailPage: Boolean(rawCandidate.isDetailPage),
        };

        await savePendingCandidate(candidate);

        // Try to open side panel — may fail if Chrome requires user gesture
        try {
          await chrome.sidePanel.open({ tabId });
        } catch {
          // Side panel opening failed — candidate is stored; panel will find it on next open
        }

        sendResponse({ ok: true, data: { tabId } });
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

  loadGrantedOrigins()
    .then((origins) => {
      if (origins.has(tabOrigin)) {
        chrome.tabs.sendMessage(tabId, { type: "ENABLE_HOVER" }).catch(() => {
          // Content script not yet ready — it will self-activate from storage on init
        });
      }
    })
    .catch(() => {
      // storage read failure — ignore
    });
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
