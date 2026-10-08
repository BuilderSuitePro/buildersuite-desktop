/**
 * Service Worker – message router for all privileged operations.
 *
 * Only messages originating from THIS extension's own contexts are processed.
 * Content scripts and web pages cannot trigger verification or access stored keys.
 */

import type {
  ExtensionMessage,
  MessageResponse,
  BspSettings,
  VerificationState,
  ExtractionResult,
  SaveApiResponse,
  DraftRecord,
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
} from "./storage.js";
import { verifyConnection, saveProduct, ApiError } from "./api.js";

/** Returns true only for messages sent from this extension's own contexts. */
function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && sender.url !== undefined;
}

/** In-flight save guard – prevents double-submit. */
let saveInFlight = false;

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    if (!isTrustedSender(sender)) {
      sendResponse({ ok: false, error: "Untrusted message sender" });
      return false;
    }

    const msg = message as ExtensionMessage;
    handleMessage(msg, sendResponse);
    return true; // keep channel open for async response
  }
);

async function handleMessage(
  message: ExtensionMessage,
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
