// ─── Settings ────────────────────────────────────────────────────────────────

export interface BspSettings {
  /** HTTPS origin of the BSP web app, e.g. https://app.buildersuitepro.com */
  bspOrigin: string;
  /** Full Verification URL (path must end with /clipper/verify) */
  verificationUrl: string;
  /** Full v2 Product URL (path must end with /clipper/v2/products) */
  productUrl: string;
  /** Bearer token – stored only in chrome.storage.local, never synced */
  connectionKey: string;
}

export type BspSettingsPartial = Partial<BspSettings>;

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof BspSettings, string>>;
}

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Shape returned by POST /clipper/verify.
 * protocolVersion: 1 is correct and intentional – do not reject it.
 */
export interface VerifyApiResponse {
  success: boolean;
  protocolVersion: number;
  verifiedAt: string;
  connectionName: string;
}

export interface VerificationState {
  status: "unverified" | "verifying" | "verified" | "failed";
  connectionName?: string;
  verifiedAt?: string;
  error?: string;
}

// ─── Messages (side panel ↔ service worker) ──────────────────────────────────

export type MessageType =
  | "LOAD_SETTINGS"
  | "SAVE_SETTINGS"
  | "VERIFY_CONNECTION"
  | "CLEAR_VERIFICATION";

export interface BaseMessage {
  type: MessageType;
}

export interface LoadSettingsMessage extends BaseMessage {
  type: "LOAD_SETTINGS";
}

export interface SaveSettingsMessage extends BaseMessage {
  type: "SAVE_SETTINGS";
  settings: BspSettings;
}

export interface VerifyConnectionMessage extends BaseMessage {
  type: "VERIFY_CONNECTION";
}

export interface ClearVerificationMessage extends BaseMessage {
  type: "CLEAR_VERIFICATION";
}

export type ExtensionMessage =
  | LoadSettingsMessage
  | SaveSettingsMessage
  | VerifyConnectionMessage
  | ClearVerificationMessage;

// ─── Message Responses ────────────────────────────────────────────────────────

export interface SuccessResponse<T = unknown> {
  ok: true;
  data: T;
}

export interface ErrorResponse {
  ok: false;
  error: string;
}

export type MessageResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;
