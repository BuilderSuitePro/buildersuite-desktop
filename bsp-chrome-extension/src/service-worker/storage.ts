/**
 * Storage module – runs ONLY in trusted extension contexts (service worker).
 * All settings are read/written exclusively via chrome.storage.local.
 * The connection key is NEVER written to chrome.storage.sync, the DOM,
 * URL parameters, console logs, or content-script-accessible paths.
 */

import type { BspSettings, VerificationState } from "../types/index.js";

const SETTINGS_KEY = "bsp_settings";
const VERIFICATION_KEY = "bsp_verification";

export async function loadSettings(): Promise<BspSettings | null> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const raw = result[SETTINGS_KEY] as BspSettings | undefined;
  return raw ?? null;
}

export async function saveSettings(settings: BspSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function loadVerificationState(): Promise<VerificationState | null> {
  const result = await chrome.storage.local.get(VERIFICATION_KEY);
  const raw = result[VERIFICATION_KEY] as VerificationState | undefined;
  return raw ?? null;
}

export async function saveVerificationState(
  state: VerificationState
): Promise<void> {
  await chrome.storage.local.set({ [VERIFICATION_KEY]: state });
}

export async function clearVerificationState(): Promise<void> {
  await chrome.storage.local.remove(VERIFICATION_KEY);
}
