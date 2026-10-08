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
  PendingCandidate,
} from "../types/index.js";

const SETTINGS_KEY = "bsp_settings";
const VERIFICATION_KEY = "bsp_verification";
const DRAFT_KEY = "bsp_draft";
const PENDING_SAVE_KEY = "bsp_pending_save";
export const PENDING_CANDIDATE_KEY = "bsp_pending_candidate";
const GRANTED_ORIGINS_KEY = "bsp_granted_origins";
const ALL_SITES_ENABLED_KEY = "bsp_all_sites_enabled";

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

// ─── Pending Candidate (hover click capture) ──────────────────────────────────

export async function loadPendingCandidate(): Promise<PendingCandidate | null> {
  const result = await chrome.storage.local.get(PENDING_CANDIDATE_KEY);
  const raw = result[PENDING_CANDIDATE_KEY] as PendingCandidate | undefined;
  return raw ?? null;
}

export async function savePendingCandidate(candidate: PendingCandidate): Promise<void> {
  await chrome.storage.local.set({ [PENDING_CANDIDATE_KEY]: candidate });
}

export async function clearPendingCandidate(): Promise<void> {
  await chrome.storage.local.remove(PENDING_CANDIDATE_KEY);
}

// ─── Granted Origins (per-site hover permission) ──────────────────────────────

export async function loadGrantedOrigins(): Promise<Set<string>> {
  const result = await chrome.storage.local.get(GRANTED_ORIGINS_KEY);
  const raw = result[GRANTED_ORIGINS_KEY] as string[] | undefined;
  return new Set(raw ?? []);
}

export async function saveGrantedOrigins(origins: Set<string>): Promise<void> {
  await chrome.storage.local.set({ [GRANTED_ORIGINS_KEY]: [...origins] });
}

export async function addGrantedOrigin(origin: string): Promise<void> {
  const origins = await loadGrantedOrigins();
  origins.add(origin);
  await saveGrantedOrigins(origins);
}

export async function removeGrantedOrigin(origin: string): Promise<void> {
  const origins = await loadGrantedOrigins();
  origins.delete(origin);
  await saveGrantedOrigins(origins);
}

// ─── All-sites hover permission flag ─────────────────────────────────────────

export async function loadAllSitesEnabled(): Promise<boolean> {
  const result = await chrome.storage.local.get(ALL_SITES_ENABLED_KEY);
  return result[ALL_SITES_ENABLED_KEY] === true;
}

export async function saveAllSitesEnabled(value: boolean): Promise<void> {
  await chrome.storage.local.set({ [ALL_SITES_ENABLED_KEY]: value });
}

export async function clearAllSitesEnabled(): Promise<void> {
  await chrome.storage.local.remove(ALL_SITES_ENABLED_KEY);
}
