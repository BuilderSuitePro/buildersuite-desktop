// ─── Discovery ────────────────────────────────────────────────────────────────

export interface BspProject {
  _id: string;
  name: string;
}

export interface BspBoard {
  _id: string;
  name: string;
}

export interface BspSelection {
  _id: string;
  name: string;
  canReplace: boolean;
  sharedWithClient: boolean;
}

export interface DiscoveryPage<T> {
  success: boolean;
  protocolVersion: number;
  page: T[];
  isDone: boolean;
  continueCursor: string;
}

// ─── Save Destination ─────────────────────────────────────────────────────────

/**
 * Destination for a board save. Both projectId and boardId are required.
 * replaceSelectionId is set only when filling an existing placeholder.
 * Never send null, empty object, or project-only destination.
 */
export interface SaveDestination {
  projectId: string;
  boardId: string;
  replaceSelectionId?: string;
}

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

// ─── Upload Tickets ────────────────────────────────────────────────────────────

export type UploadState =
  | "local"
  | "beginning"
  | "uploading"
  | "uploaded-awaiting-finish"
  | "ready"
  | "attached"
  | "cleanup-needed";

export type UploadKind = "image" | "attachment";

export interface UploadTicket {
  uploadId: string;
  uploadUrl: string;
  storageId: string | null;
  /** Standard base64 (RFC 4648) SHA-256 of the file bytes, always 44 chars ending in '=' */
  sha256: string;
  name: string;
  kind: UploadKind;
  state: UploadState;
  createdAt: number;
}

export type UploadTicketsRecord = Record<string, UploadTicket>;

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
  /** Ordered IDs of image upload tickets (uploaded images in slot order) */
  imageUploadIds: string[];
  /** Ordered IDs of attachment upload tickets */
  attachmentIds: string[];
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
  /** Board save destination. Omit entirely for library-only saves. Never send null or empty. */
  destination?: SaveDestination;
}

export interface PendingSave {
  requestId: string;
  product: ProductSavePayload["product"];
  uploadIds: string[];
  /** Preserved for safe retry of board saves. */
  destination?: SaveDestination;
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

// ─── Pending Candidate ────────────────────────────────────────────────────────

/**
 * Snapshot of the product context captured when the hover button is clicked.
 * Written by the content script (via service worker relay) and consumed by the panel.
 * NEVER contains the connection key or any credentials.
 */
export interface PendingCandidate {
  imageUrl: string;
  altText?: string;
  sourceUrl: string;
  /** URL of the specific product card link (may differ from sourceUrl on list pages) */
  cardLink?: string;
  /** Title extracted from the card context */
  cardTitle?: string;
  /** Price extracted from the card context */
  cardPrice?: number;
  /** Unix ms timestamp of when the capture was initiated */
  timestamp: number;
  /** The tab that originated the capture */
  tabId: number;
  /** Whether this came from a product detail page (vs a list/category page) */
  isDetailPage?: boolean;
}

// ─── Granted Origins ──────────────────────────────────────────────────────────

/**
 * Origins where the user has explicitly enabled hover picking.
 * Keys are HTTPS origins like "https://example.com".
 * Stored in chrome.storage.local.
 */
export interface GrantedOriginsRecord {
  origins: string[];
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
  | "CLEAR_DRAFT"
  | "HOVER_IMAGE_CLICKED"
  | "ENABLE_HOVER_ON_SITE"
  | "DISABLE_HOVER_ON_SITE"
  | "GET_HOVER_SITE_STATE"
  | "GET_PENDING_CANDIDATE"
  | "CLEAR_PENDING_CANDIDATE"
  | "PANEL_READY"
  | "ENABLE_ALL_SITES"
  | "DISABLE_ALL_SITES"
  | "GET_ALL_SITES_STATE"
  | "BEGIN_UPLOAD"
  | "FINISH_UPLOAD"
  | "DISCARD_UPLOAD"
  | "DISCOVER_PROJECTS"
  | "DISCOVER_BOARDS"
  | "DISCOVER_SELECTIONS";

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

export interface HoverImageClickedMessage extends BaseMessage {
  type: "HOVER_IMAGE_CLICKED";
  candidate: PendingCandidate;
}

export interface EnableHoverOnSiteMessage extends BaseMessage {
  type: "ENABLE_HOVER_ON_SITE";
  origin: string;
}

export interface DisableHoverOnSiteMessage extends BaseMessage {
  type: "DISABLE_HOVER_ON_SITE";
  origin: string;
}

export interface GetHoverSiteStateMessage extends BaseMessage {
  type: "GET_HOVER_SITE_STATE";
  origin: string;
}

export interface GetPendingCandidateMessage extends BaseMessage {
  type: "GET_PENDING_CANDIDATE";
}

export interface ClearPendingCandidateMessage extends BaseMessage {
  type: "CLEAR_PENDING_CANDIDATE";
}

export interface PanelReadyMessage extends BaseMessage {
  type: "PANEL_READY";
}

export interface EnableAllSitesMessage extends BaseMessage {
  type: "ENABLE_ALL_SITES";
}

export interface DisableAllSitesMessage extends BaseMessage {
  type: "DISABLE_ALL_SITES";
}

export interface GetAllSitesStateMessage extends BaseMessage {
  type: "GET_ALL_SITES_STATE";
}

export interface BeginUploadMessage extends BaseMessage {
  type: "BEGIN_UPLOAD";
  kind: UploadKind;
  name: string;
  sha256: string;
}

export interface FinishUploadMessage extends BaseMessage {
  type: "FINISH_UPLOAD";
  uploadId: string;
  storageId: string;
}

export interface DiscardUploadMessage extends BaseMessage {
  type: "DISCARD_UPLOAD";
  uploadId: string;
}

export interface DiscoverProjectsMessage extends BaseMessage {
  type: "DISCOVER_PROJECTS";
  cursor: string | null;
}

export interface DiscoverBoardsMessage extends BaseMessage {
  type: "DISCOVER_BOARDS";
  projectId: string;
  cursor: string | null;
}

export interface DiscoverSelectionsMessage extends BaseMessage {
  type: "DISCOVER_SELECTIONS";
  projectId: string;
  boardId: string;
  cursor: string | null;
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
  | ClearDraftMessage
  | HoverImageClickedMessage
  | EnableHoverOnSiteMessage
  | DisableHoverOnSiteMessage
  | GetHoverSiteStateMessage
  | GetPendingCandidateMessage
  | ClearPendingCandidateMessage
  | PanelReadyMessage
  | EnableAllSitesMessage
  | DisableAllSitesMessage
  | GetAllSitesStateMessage
  | BeginUploadMessage
  | FinishUploadMessage
  | DiscardUploadMessage
  | DiscoverProjectsMessage
  | DiscoverBoardsMessage
  | DiscoverSelectionsMessage;

// ─── Content Script Messages ──────────────────────────────────────────────────

export type ContentMessageType =
  | "EXTRACT_PRODUCT"
  | "START_PICK_TEXT"
  | "START_PICK_IMAGE"
  | "CANCEL_PICK"
  | "ENABLE_HOVER"
  | "DISABLE_HOVER";

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

export interface ContentEnableHoverMessage {
  type: "ENABLE_HOVER";
}

export interface ContentDisableHoverMessage {
  type: "DISABLE_HOVER";
}

export type ContentMessage =
  | ContentExtractMessage
  | ContentPickTextMessage
  | ContentPickImageMessage
  | ContentCancelPickMessage
  | ContentEnableHoverMessage
  | ContentDisableHoverMessage;

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
