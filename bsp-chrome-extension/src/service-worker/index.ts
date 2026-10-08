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
} from "../types/index.js";
import {
  loadSettings,
  saveSettings,
  loadVerificationState,
  clearVerificationState,
  saveVerificationState,
} from "./storage.js";
import { verifyConnection, ApiError } from "./api.js";

/** Returns true only for messages sent from this extension's own contexts. */
function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && sender.url !== undefined;
}

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
