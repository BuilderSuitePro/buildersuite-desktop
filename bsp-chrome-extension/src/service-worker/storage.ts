/**
 * Storage module – runs ONLY in trusted extension contexts (service worker).
 * All settings are read/written exclusively via chrome.storage.local.
 * The connection key is NEVER written to chrome.storage.sync, the DOM,
 * URL parameters, console logs, or content-script-accessible paths.
 */

import type {
  BspSettings,
  VerificationState,
  DraftRecord,
  PendingSave,
} from "../types/index.js";

const SETTINGS_KEY = "bsp_settings";
const VERIFICATION_KEY = "bsp_verification";
const DRAFT_KEY = "bsp_draft";
const PENDING_SAVE_KEY = "bsp_pending_save";

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

// ─── Draft ────────────────────────────────────────────────────────────────────

export async function loadDraft(): Promise<DraftRecord | null> {
  const result = await chrome.storage.local.get(DRAFT_KEY);
  const raw = result[DRAFT_KEY] as DraftRecord | undefined;
  return raw ?? null;
}

export async function saveDraft(draft: DraftRecord): Promise<void> {
  await chrome.storage.local.set({ [DRAFT_KEY]: draft });
}

export async function clearDraft(): Promise<void> {
  await chrome.storage.local.remove(DRAFT_KEY);
}

// ─── Pending Save ─────────────────────────────────────────────────────────────

export async function loadPendingSave(): Promise<PendingSave | null> {
  const result = await chrome.storage.local.get(PENDING_SAVE_KEY);
  const raw = result[PENDING_SAVE_KEY] as PendingSave | undefined;
  return raw ?? null;
}

export async function savePendingSave(pending: PendingSave): Promise<void> {
  await chrome.storage.local.set({ [PENDING_SAVE_KEY]: pending });
}

export async function clearPendingSave(): Promise<void> {
  await chrome.storage.local.remove(PENDING_SAVE_KEY);
}
