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

// ─── Extraction ───────────────────────────────────────────────────────────────

export interface PriceCandidate {
  value: number;
  context: string;
}

export interface ExtractionResult {
  title?: string;
  sourceUrl: string;
  description?: string;
  cost?: number;
  msrp?: number;
  currency?: string;
  currencyWarning?: string;
  supplierName?: string;
  manufacturer?: string;
  sku?: string;
  dimensions?: string;
  finishColor?: string;
  composition?: string;
  category?: string;
  imageUrls: string[];
  priceCandidates?: PriceCandidate[];
}

// ─── Product Form / Draft ─────────────────────────────────────────────────────

export interface ProductFormState {
  title: string;
  sourceUrl: string;
  description: string;
  cost: string;
  markupPercent: string;
  quantity: string;
  unit: string;
  msrp: string;
  taxable: boolean;
  supplierName: string;
  manufacturer: string;
  sku: string;
  dimensions: string;
  finishColor: string;
  composition: string;
  category: string;
  vendorDescription: string;
  internalNotes: string;
  tags: string;
  imageUrls: string[];
  selectedImageIndexes: boolean[];
}

export interface DraftRecord {
  sourceUrl: string;
  form: ProductFormState;
  savedAt: number;
}

// ─── Save API ─────────────────────────────────────────────────────────────────

export interface ProductSavePayload {
  operation: "save";
  requestId: string;
  product: {
    title: string;
    sourceUrl: string;
    description?: string;
    cost?: number;
    msrp?: number;
    supplierName?: string;
    manufacturer?: string;
    sku?: string;
    dimensions?: string;
    finishColor?: string;
    composition?: string;
    category?: string;
    markupPercent?: number;
    quantity?: number;
    unit?: string;
    taxable?: boolean;
    vendorDescription?: string;
    internalNotes?: string;
    tags?: string[];
    imageUrls: string[];
  };
  uploadIds: string[];
}

export interface PendingSave {
  requestId: string;
  product: ProductSavePayload["product"];
  uploadIds: string[];
  timestamp: number;
}

export interface SaveApiResponse {
  success: boolean;
  protocolVersion: number;
  materialId: string;
  path: string;
  replayed: boolean;
  selectionId?: string;
  selectionPath?: string;
}

// ─── Messages (side panel ↔ service worker) ──────────────────────────────────

export type MessageType =
  | "LOAD_SETTINGS"
  | "SAVE_SETTINGS"
  | "VERIFY_CONNECTION"
  | "CLEAR_VERIFICATION"
  | "EXTRACT_PAGE"
  | "SAVE_PRODUCT"
  | "LOAD_DRAFT"
  | "SAVE_DRAFT"
  | "CLEAR_DRAFT";

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

export interface ExtractPageMessage extends BaseMessage {
  type: "EXTRACT_PAGE";
  tabId: number;
}

export interface SaveProductMessage extends BaseMessage {
  type: "SAVE_PRODUCT";
  payload: ProductSavePayload;
}

export interface LoadDraftMessage extends BaseMessage {
  type: "LOAD_DRAFT";
}

export interface SaveDraftMessage extends BaseMessage {
  type: "SAVE_DRAFT";
  draft: DraftRecord;
}

export interface ClearDraftMessage extends BaseMessage {
  type: "CLEAR_DRAFT";
}

export type ExtensionMessage =
  | LoadSettingsMessage
  | SaveSettingsMessage
  | VerifyConnectionMessage
  | ClearVerificationMessage
  | ExtractPageMessage
  | SaveProductMessage
  | LoadDraftMessage
  | SaveDraftMessage
  | ClearDraftMessage;

// ─── Content Script Messages ──────────────────────────────────────────────────

export type ContentMessageType =
  | "EXTRACT_PRODUCT"
  | "START_PICK_TEXT"
  | "START_PICK_IMAGE"
  | "CANCEL_PICK";

export interface ContentExtractMessage {
  type: "EXTRACT_PRODUCT";
}

export interface ContentPickTextMessage {
  type: "START_PICK_TEXT";
}

export interface ContentPickImageMessage {
  type: "START_PICK_IMAGE";
}

export interface ContentCancelPickMessage {
  type: "CANCEL_PICK";
}

export type ContentMessage =
  | ContentExtractMessage
  | ContentPickTextMessage
  | ContentPickImageMessage
  | ContentCancelPickMessage;

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
