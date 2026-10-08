import React, { useState, useEffect, useCallback, useRef } from "react";
import type {
  ProductFormState,
  ExtractionResult,
  PriceCandidate,
  ProductSavePayload,
  SaveApiResponse,
  DraftRecord,
  MessageResponse,
  PendingCandidate,
  UploadTicket,
  UploadTicketsRecord,
  UploadState,
} from "../../types/index.js";
import {
  validateProductForm,
  buildSavePayload,
  buildDestination,
  computePricingPreview,
} from "../../shared/validation.js";
import {
  validateUploadFile,
  computeSha256Base64,
  buildUploadIds,
} from "../../shared/upload.js";
import DestinationSelector from "./DestinationSelector.js";
import type { DestinationFormState } from "./DestinationSelector.js";

const UPLOAD_TICKETS_KEY = "uploadTickets";
const MAX_IMAGE_UPLOADS = 5;
const MAX_ATTACHMENTS = 10;

// ─── Default form state ───────────────────────────────────────────────────────

function defaultForm(sourceUrl = ""): ProductFormState {
  return {
    title: "",
    sourceUrl,
    description: "",
    cost: "",
    markupPercent: "0",
    quantity: "1",
    unit: "each",
    msrp: "",
    taxable: false,
    supplierName: "",
    manufacturer: "",
    sku: "",
    dimensions: "",
    finishColor: "",
    composition: "",
    category: "",
    vendorDescription: "",
    internalNotes: "",
    tags: "",
    imageUrls: [],
    selectedImageIndexes: [],
    imageUploadIds: [],
    attachmentIds: [],
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    background: "#f9f9f9",
    paddingBottom: 80, // space for sticky footer
  },
  // ── Image grid ──
  imageSection: {
    background: "#fff",
    borderBottom: "1px solid #ebebeb",
    padding: "12px 12px 10px",
  },
  imageGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "auto auto",
    gap: 6,
  },
  primarySlot: {
    gridColumn: "1",
    gridRow: "1 / span 2",
    aspectRatio: "1",
    borderRadius: 8,
    overflow: "hidden",
    border: "1.5px solid #e0e0e0",
    background: "#f5f5f5",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
  secondarySlot: {
    aspectRatio: "1",
    borderRadius: 7,
    overflow: "hidden",
    border: "1.5px solid #e0e0e0",
    background: "#f5f5f5",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  slotImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  slotEmpty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    width: "100%",
    height: "100%",
    padding: 8,
    cursor: "pointer",
  },
  slotEmptyText: {
    fontSize: 10,
    color: "#aaa",
    textAlign: "center",
  },
  slotEmptyIcon: {
    fontSize: 18,
    color: "#ccc",
    lineHeight: 1,
  },
  slotRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    background: "rgba(0,0,0,0.55)",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    width: 20,
    height: 20,
    fontSize: 11,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    lineHeight: 1,
  },
  slotCoverBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    background: "#B8962E",
    color: "#fff",
    fontSize: 9,
    fontWeight: 700,
    padding: "1px 5px",
    borderRadius: 3,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  imageCountBadge: {
    fontSize: 11,
    color: "#888",
    marginTop: 6,
  },
  // Slot menu
  slotMenu: {
    position: "absolute" as const,
    background: "#fff",
    border: "1px solid #ddd",
    borderRadius: 6,
    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
    zIndex: 100,
    minWidth: 150,
    padding: "4px 0",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  },
  slotMenuItem: {
    display: "block",
    width: "100%",
    textAlign: "left" as const,
    background: "none",
    border: "none",
    padding: "7px 12px",
    fontSize: 12,
    color: "#2D2D2D",
    cursor: "pointer",
  },
  // ── Title & source ──
  titleSection: {
    background: "#fff",
    borderBottom: "1px solid #ebebeb",
    padding: "10px 12px",
  },
  titleInput: {
    width: "100%",
    boxSizing: "border-box" as const,
    fontSize: 14,
    fontWeight: 600,
    padding: "6px 8px",
    border: "1px solid #e0e0e0",
    borderRadius: 5,
    outline: "none",
    color: "#2D2D2D",
    background: "#fff",
    marginBottom: 6,
  },
  titleInputError: {
    borderColor: "#c0392b",
  },
  sourceUrlRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    color: "#888",
  },
  sourceUrlText: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    cursor: "pointer",
  },
  sourceUrlInput: {
    flex: 1,
    fontSize: 11,
    padding: "3px 6px",
    border: "1px solid #ddd",
    borderRadius: 4,
    outline: "none",
    color: "#2D2D2D",
  },
  // ── Form sections ──
  formSection: {
    background: "#fff",
    borderBottom: "1px solid #ebebeb",
    padding: "12px 12px 10px",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: "#aaa",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  row2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 8,
  },
  row3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 6,
    marginBottom: 8,
  },
  fieldGroup: {
    marginBottom: 8,
  },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "#666",
    marginBottom: 3,
  },
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    fontSize: 13,
    padding: "5px 8px",
    border: "1px solid #e0e0e0",
    borderRadius: 5,
    outline: "none",
    background: "#fff",
    color: "#2D2D2D",
  },
  inputError: {
    borderColor: "#c0392b",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box" as const,
    fontSize: 12,
    padding: "5px 8px",
    border: "1px solid #e0e0e0",
    borderRadius: 5,
    outline: "none",
    resize: "vertical" as const,
    background: "#fff",
    fontFamily: "inherit",
    color: "#2D2D2D",
    lineHeight: 1.5,
  },
  errorText: {
    fontSize: 11,
    color: "#c0392b",
    marginTop: 2,
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    cursor: "pointer",
    userSelect: "none" as const,
    color: "#444",
  },
  checkbox: { accentColor: "#B8962E", cursor: "pointer", marginTop: 1 },
  // ── Pricing preview ──
  pricingPreviewRow: {
    fontSize: 12,
    color: "#555",
    background: "#f8f6ef",
    borderRadius: 5,
    padding: "6px 8px",
    marginTop: 6,
  },
  // ── Accordion ──
  accordionSection: {
    background: "#fff",
    borderBottom: "1px solid #ebebeb",
  },
  accordionHeader: {
    width: "100%",
    textAlign: "left" as const,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 600,
    color: "#2D2D2D",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  accordionContent: {
    padding: "0 12px 12px",
  },
  // ── Destination ──
  destinationRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 0",
    fontSize: 13,
    color: "#444",
  },
  destinationNote: {
    fontSize: 11,
    color: "#aaa",
    marginTop: 4,
  },
  // ── Warnings / banners ──
  warning: {
    background: "#fff8e1",
    border: "1px solid #f0c040",
    borderRadius: 5,
    padding: "7px 10px",
    fontSize: 12,
    color: "#856404",
    marginBottom: 8,
  },
  autofillDot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#B8962E",
    marginLeft: 4,
    verticalAlign: "middle",
  },
  draftBanner: {
    background: "#f0f8ff",
    borderBottom: "1px solid #b3d9f7",
    padding: "6px 12px",
    fontSize: 11,
    color: "#1a5c8a",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexShrink: 0,
  },
  priceCandidateList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 8,
  },
  priceCandidateItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
  },
  priceCandidateBtn: {
    fontSize: 11,
    padding: "2px 8px",
    background: "#B8962E",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  },
  // ── Footer ──
  footer: {
    position: "fixed" as const,
    bottom: 0,
    left: 0,
    right: 0,
    background: "#fff",
    borderTop: "1px solid #e8e8e8",
    padding: "10px 12px",
    zIndex: 50,
  },
  saveBtn: {
    width: "100%",
    padding: "11px 0",
    background: "#2D2D2D",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: 0.2,
  },
  saveBtnDisabled: {
    background: "#bbb",
    cursor: "not-allowed",
  },
  successBox: {
    background: "#eafaf1",
    border: "1px solid #82c99b",
    borderRadius: 5,
    padding: "8px 10px",
    fontSize: 12,
    color: "#1a7a45",
    marginTop: 8,
  },
  unknownOutcome: {
    background: "#fff3cd",
    border: "1px solid #ffc107",
    borderRadius: 5,
    padding: "8px 10px",
    fontSize: 12,
    color: "#664d03",
    marginTop: 8,
  },
  errorBox: {
    background: "#fdecea",
    border: "1px solid #f5c6cb",
    borderRadius: 5,
    padding: "8px 10px",
    fontSize: 12,
    color: "#721c24",
    marginTop: 8,
  },
  // ── Draft conflict ──
  conflictOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.42)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 16,
  },
  conflictDialog: {
    background: "#fff",
    borderRadius: 8,
    padding: "18px 16px",
    maxWidth: 310,
    width: "100%",
    boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
  },
  conflictTitle: {
    fontWeight: 700,
    fontSize: 14,
    color: "#2D2D2D",
    marginBottom: 7,
  },
  conflictBody: {
    fontSize: 12,
    color: "#555",
    marginBottom: 14,
    lineHeight: 1.55,
  },
  conflictBtnRow: { display: "flex", gap: 8 },
  conflictBtnPrimary: {
    flex: 1,
    padding: "8px 0",
    background: "#2D2D2D",
    color: "#fff",
    border: "none",
    borderRadius: 5,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  conflictBtnSecondary: {
    flex: 1,
    padding: "8px 0",
    background: "#f5f5f5",
    color: "#444",
    border: "1px solid #ccc",
    borderRadius: 5,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  // ── Add image URL input ──
  addUrlRow: {
    display: "flex",
    gap: 5,
    alignItems: "center",
    marginTop: 5,
  },
  addUrlInput: {
    flex: 1,
    fontSize: 11,
    padding: "4px 7px",
    border: "1px solid #e0e0e0",
    borderRadius: 4,
    outline: "none",
    minWidth: 0,
  },
  addUrlBtn: {
    fontSize: 11,
    padding: "4px 8px",
    background: "#f0f0f0",
    border: "1px solid #ccc",
    borderRadius: 4,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  pickBtn: {
    fontSize: 11,
    padding: "4px 8px",
    background: "#f0f0f0",
    border: "1px solid #ccc",
    borderRadius: 4,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  // ── Upload-specific ──
  slotProgress: {
    position: "absolute" as const,
    inset: 0,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.92)",
    gap: 4,
    padding: 6,
  },
  slotProgressLabel: {
    fontSize: 10,
    color: "#555",
    textAlign: "center" as const,
  },
  slotProgressBar: {
    width: "80%",
    height: 4,
    background: "#e0e0e0",
    borderRadius: 2,
    overflow: "hidden",
  },
  slotProgressFill: {
    height: "100%",
    background: "#B8962E",
    transition: "width 0.2s",
  },
  slotErrorBadge: {
    position: "absolute" as const,
    inset: 0,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(253,236,234,0.95)",
    padding: 6,
    gap: 4,
  },
  slotErrorText: {
    fontSize: 9,
    color: "#721c24",
    textAlign: "center" as const,
    wordBreak: "break-word" as const,
  },
  slotRetryBtn: {
    fontSize: 9,
    padding: "2px 6px",
    background: "#B8962E",
    color: "#fff",
    border: "none",
    borderRadius: 3,
    cursor: "pointer",
  },
  // ── Attachment section ──
  attachmentRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 0",
    borderBottom: "1px solid #f0f0f0",
    fontSize: 12,
  },
  attachmentName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    color: "#333",
  },
  attachmentSize: {
    fontSize: 11,
    color: "#aaa",
    flexShrink: 0,
  },
  attachmentStateBadge: {
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 8,
    fontWeight: 600,
    flexShrink: 0,
  },
  attachmentRemoveBtn: {
    background: "none",
    border: "none",
    color: "#bbb",
    cursor: "pointer",
    fontSize: 14,
    padding: "0 2px",
    flexShrink: 0,
    lineHeight: 1,
  },
  uploadFileBtn: {
    fontSize: 12,
    padding: "5px 10px",
    background: "#f0f0f0",
    border: "1px solid #ccc",
    borderRadius: 4,
    cursor: "pointer",
    marginTop: 6,
  },
  recoveryBanner: {
    background: "#fff3cd",
    border: "1px solid #ffc107",
    borderRadius: 5,
    padding: "8px 10px",
    fontSize: 12,
    color: "#664d03",
    marginBottom: 8,
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  error?: string;
  autoFilled?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

function Field({ label, error, autoFilled, children, style }: FieldProps) {
  return (
    <div style={{ ...s.fieldGroup, ...style }}>
      <label style={s.label}>
        {label}
        {autoFilled && (
          <span style={s.autofillDot} title="Auto-filled from page" aria-hidden="true" />
        )}
      </label>
      {children}
      {error && <div style={s.errorText}>{error}</div>}
    </div>
  );
}

// ─── Upload state badge helper ────────────────────────────────────────────────

function stateBadgeStyle(state: UploadState): React.CSSProperties {
  const base = s.attachmentStateBadge;
  switch (state) {
    case "beginning":
    case "uploading":
    case "uploaded-awaiting-finish":
      return { ...base, background: "#e8f4fd", color: "#1a5c8a" };
    case "ready":
      return { ...base, background: "#eafaf1", color: "#1a7a45" };
    case "attached":
      return { ...base, background: "#f3f3f3", color: "#666" };
    case "cleanup-needed":
    case "local":
      return { ...base, background: "#fdecea", color: "#721c24" };
    default:
      return base;
  }
}

function stateLabel(state: UploadState, progress?: number): string {
  switch (state) {
    case "local": return "Pending";
    case "beginning": return "Starting…";
    case "uploading": return progress !== undefined ? `Uploading ${progress}%` : "Uploading…";
    case "uploaded-awaiting-finish": return "Processing…";
    case "ready": return "Ready";
    case "attached": return "Saved";
    case "cleanup-needed": return "Cleanup needed";
    default: return state;
  }
}

// ─── ImageSlot component ──────────────────────────────────────────────────────

interface ImageSlotProps {
  index: number;
  url?: string;
  isCover?: boolean;
  isPrimary?: boolean;
  uploadTicket?: UploadTicket;
  uploadProgress?: number;
  uploadError?: string;
  onRemove?: (i: number) => void;
  onPickFromPage?: () => void;
  onAddUrl?: (url: string) => void;
  onUploadFile?: () => void;
  onRetryUpload?: () => void;
  activeTabId?: number | null;
}

function ImageSlot({
  index,
  url,
  isCover,
  isPrimary,
  uploadTicket,
  uploadProgress,
  uploadError,
  onRemove,
  onPickFromPage,
  onAddUrl,
  onUploadFile,
  onRetryUpload,
  activeTabId,
}: ImageSlotProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [urlInputOpen, setUrlInputOpen] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const slotRef = useRef<HTMLDivElement | null>(null);

  const handleAddUrl = () => {
    const trimmed = urlValue.trim();
    if (trimmed && onAddUrl) {
      onAddUrl(trimmed);
      setUrlValue("");
      setUrlInputOpen(false);
      setMenuOpen(false);
    }
  };

  const baseStyle = isPrimary ? s.primarySlot : s.secondarySlot;

  // Uploaded image slot (ticket exists)
  if (uploadTicket) {
    const isInProgress =
      uploadTicket.state === "beginning" ||
      uploadTicket.state === "uploading" ||
      uploadTicket.state === "uploaded-awaiting-finish";

    // For preview, use object URL if we have local bytes (handled outside via previewUrls)
    // url prop may be set to an object URL or undefined
    return (
      <div style={baseStyle} ref={slotRef}>
        {url ? (
          <img
            src={url}
            alt={uploadTicket.name}
            style={s.slotImg}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div style={{ ...s.slotEmpty, background: "none", border: "none" }}>
            <span style={{ fontSize: 18, color: "#ddd" }}>🖼</span>
          </div>
        )}

        {isCover && uploadTicket.state === "ready" && (
          <div style={s.slotCoverBadge}>Cover</div>
        )}

        {isInProgress && (
          <div style={s.slotProgress}>
            <span style={s.slotProgressLabel}>
              {stateLabel(uploadTicket.state, uploadProgress)}
            </span>
            {uploadTicket.state === "uploading" && (
              <div style={s.slotProgressBar}>
                <div style={{ ...s.slotProgressFill, width: `${uploadProgress ?? 0}%` }} />
              </div>
            )}
          </div>
        )}

        {uploadError && !isInProgress && (
          <div style={s.slotErrorBadge}>
            <span style={s.slotErrorText}>{uploadError}</span>
            {onRetryUpload && (
              <button style={s.slotRetryBtn} onClick={onRetryUpload} type="button">
                Retry
              </button>
            )}
          </div>
        )}

        {/* Only allow removal if not attached */}
        {onRemove && !isInProgress && uploadTicket.state !== "attached" && (
          <button
            style={s.slotRemoveBtn}
            onClick={() => onRemove(index)}
            type="button"
            aria-label={`Remove image ${index + 1}`}
            title="Remove"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  // External URL image slot
  if (url) {
    return (
      <div style={baseStyle} ref={slotRef}>
        <img
          src={url}
          alt={`Product image ${index + 1}`}
          style={s.slotImg}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        {isCover && <div style={s.slotCoverBadge}>Cover</div>}
        {onRemove && (
          <button
            style={s.slotRemoveBtn}
            onClick={() => onRemove(index)}
            type="button"
            aria-label={`Remove image ${index + 1}`}
            title="Remove"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  // Empty slot
  return (
    <div style={{ ...baseStyle, position: "relative" }} ref={slotRef}>
      {!menuOpen && !urlInputOpen && (
        <button
          style={{ ...s.slotEmpty, background: "none", border: "none", cursor: "pointer" }}
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={`Add image to slot ${index + 1}`}
        >
          <span style={s.slotEmptyIcon}>+</span>
          {isPrimary && <span style={s.slotEmptyText}>Add image</span>}
        </button>
      )}

      {menuOpen && (
        <div style={s.slotMenu}>
          {onUploadFile && (
            <button
              style={s.slotMenuItem}
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onUploadFile();
              }}
            >
              Upload image
            </button>
          )}
          {activeTabId && (
            <button
              style={s.slotMenuItem}
              type="button"
              onClick={() => {
                setMenuOpen(false);
                if (onPickFromPage) onPickFromPage();
              }}
            >
              Pick from page
            </button>
          )}
          <button
            style={s.slotMenuItem}
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setUrlInputOpen(true);
            }}
          >
            Add image URL
          </button>
          <button
            style={{ ...s.slotMenuItem, color: "#888", fontSize: 11 }}
            type="button"
            onClick={() => setMenuOpen(false)}
          >
            Cancel
          </button>
        </div>
      )}

      {urlInputOpen && (
        <div style={{ padding: 8, width: "100%", boxSizing: "border-box" }}>
          <input
            style={{ ...s.addUrlInput, width: "100%", marginBottom: 5 }}
            type="url"
            placeholder="https://…"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddUrl();
              if (e.key === "Escape") {
                setUrlInputOpen(false);
                setUrlValue("");
              }
            }}
            autoFocus
          />
          <div style={{ display: "flex", gap: 4 }}>
            <button style={s.addUrlBtn} type="button" onClick={handleAddUrl}>Add</button>
            <button
              style={{ ...s.addUrlBtn, background: "none", color: "#888" }}
              type="button"
              onClick={() => { setUrlInputOpen(false); setUrlValue(""); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Upload bytes helper ───────────────────────────────────────────────────────

/**
 * Upload raw file bytes to the given URL using XHR for progress tracking.
 * CRITICAL: No Authorization header is attached — this posts to a storage service, not BSP.
 */
function uploadBytesWithProgress(
  uploadUrl: string,
  bytes: ArrayBuffer,
  mimeType: string,
  onProgress: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.setRequestHeader("Content-Type", mimeType);
    // No Authorization header — this is a storage service, not BSP

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as Record<string, unknown>;
          const storageId = data["storageId"];
          if (typeof storageId === "string" && storageId) {
            resolve(storageId);
          } else {
            reject(new Error("Upload response missing storageId"));
          }
        } catch {
          reject(new Error("Could not parse upload response JSON"));
        }
      } else {
        reject(new Error(`Upload failed: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.send(bytes);
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success"; materialId: string; path: string; replayed: boolean; selectionId?: string; selectionPath?: string }
  | { status: "unknown"; requestId: string; frozenPayload: ProductSavePayload; error: string }
  | { status: "error"; error: string; keepDraft: boolean; is404?: boolean; is409?: boolean; is403?: boolean };

type AutoFilledFields = Set<keyof ProductFormState>;

interface ProductFormProps {
  activeTabId: number | null;
  activeTabUrl: string;
  bspOrigin: string;
  isConnected: boolean;
  pendingCandidate: PendingCandidate | null;
  onCandidateConsumed: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProductForm({
  activeTabId,
  activeTabUrl,
  bspOrigin,
  isConnected,
  pendingCandidate,
  onCandidateConsumed,
}: ProductFormProps) {
  const [form, setForm] = useState<ProductFormState>(() => defaultForm(activeTabUrl));
  const [autoFilled, setAutoFilled] = useState<AutoFilledFields>(new Set());
  const [errors, setErrors] = useState<ReturnType<typeof validateProductForm>>({});
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [priceCandidates, setPriceCandidates] = useState<PriceCandidate[]>([]);
  const [currencyWarning, setCurrencyWarning] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showDestination, setShowDestination] = useState(false);
  const [editingSourceUrl, setEditingSourceUrl] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftBanner, setDraftBanner] = useState<string | null>(null);
  const [conflictPending, setConflictPending] = useState<PendingCandidate | null>(null);
  const [urlInput, setUrlInput] = useState("");

  // ── Destination state ───────────────────────────────────────────────────────
  const [destinationState, setDestinationState] = useState<DestinationFormState>({ mode: "library" });

  // ── Upload state ────────────────────────────────────────────────────────────
  const [uploadTickets, setUploadTickets] = useState<UploadTicketsRecord>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({}); // uploadId → object URL
  const [recoveryTickets, setRecoveryTickets] = useState<UploadTicket[]>([]);
  // Hidden file input refs
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadKindRef = useRef<"image" | "attachment" | null>(null);
  // Preview URL cleanup
  const previewUrlsRef = useRef<Record<string, string>>({});

  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load tickets from storage ───────────────────────────────────────────────

  useEffect(() => {
    chrome.storage.local.get(UPLOAD_TICKETS_KEY, (result) => {
      const tickets = (result[UPLOAD_TICKETS_KEY] as UploadTicketsRecord | undefined) ?? {};
      setUploadTickets(tickets);

      // Scan for recovery tickets
      const pendingFinish = Object.values(tickets).filter(
        (t) => t.state === "uploaded-awaiting-finish" && t.uploadId && t.storageId
      );
      if (pendingFinish.length > 0) {
        setRecoveryTickets(pendingFinish);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup preview object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(previewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // ── Ticket persistence helpers ──────────────────────────────────────────────

  const persistTicket = useCallback((ticket: UploadTicket) => {
    setUploadTickets((prev) => {
      const updated = { ...prev, [ticket.uploadId]: ticket };
      chrome.storage.local.set({ [UPLOAD_TICKETS_KEY]: updated });
      return updated;
    });
  }, []);

  const updateTicket = useCallback((uploadId: string, patch: Partial<UploadTicket>) => {
    setUploadTickets((prev) => {
      const existing = prev[uploadId];
      if (!existing) return prev;
      const updated = { ...prev, [uploadId]: { ...existing, ...patch } };
      chrome.storage.local.set({ [UPLOAD_TICKETS_KEY]: updated });
      return updated;
    });
  }, []);

  const removeTicketFromStorage = useCallback((uploadId: string) => {
    setUploadTickets((prev) => {
      const updated = { ...prev };
      delete updated[uploadId];
      chrome.storage.local.set({ [UPLOAD_TICKETS_KEY]: updated });
      return updated;
    });
  }, []);

  // ── Upload flow ─────────────────────────────────────────────────────────────

  const handleFileSelected = useCallback(async (file: File) => {
    const kind = pendingUploadKindRef.current ?? "image";

    // 1. Validate
    const validation = validateUploadFile(file, kind);
    if (!validation.valid) {
      // Show error in a temp slot — use a synthetic key for display
      const errKey = `err-${Date.now()}`;
      setUploadErrors((prev) => ({ ...prev, [errKey]: validation.error! }));
      setTimeout(() => {
        setUploadErrors((prev) => {
          const next = { ...prev };
          delete next[errKey];
          return next;
        });
      }, 8000);
      return;
    }

    // 2. Check limits
    if (kind === "image" && form.imageUploadIds.length >= MAX_IMAGE_UPLOADS) {
      setUploadErrors((prev) => ({ ...prev, "limit-img": "Maximum 5 uploaded images reached." }));
      return;
    }
    if (kind === "attachment" && form.attachmentIds.length >= MAX_ATTACHMENTS) {
      setUploadErrors((prev) => ({ ...prev, "limit-att": "Maximum 10 attachments reached." }));
      return;
    }

    // 3. Create preview object URL
    const previewUrl = URL.createObjectURL(file);

    // 4. Compute SHA-256
    let sha256: string;
    try {
      const fileBytes = await file.arrayBuffer();
      sha256 = await computeSha256Base64(fileBytes);
    } catch {
      setUploadErrors((prev) => ({ ...prev, "hash-err": "Failed to hash file." }));
      URL.revokeObjectURL(previewUrl);
      return;
    }

    // 5. BEGIN via service worker (credentials needed)
    const beginResp = await new Promise<MessageResponse<{ uploadId: string; uploadUrl: string }>>(
      (resolve) => {
        chrome.runtime.sendMessage(
          { type: "BEGIN_UPLOAD", kind, name: file.name, sha256 },
          (resp) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message ?? "Begin failed" });
            } else {
              resolve(resp as MessageResponse<{ uploadId: string; uploadUrl: string }>);
            }
          }
        );
      }
    );

    if (!beginResp.ok) {
      URL.revokeObjectURL(previewUrl);
      setUploadErrors((prev) => ({ ...prev, "begin-err": beginResp.error }));
      return;
    }

    const { uploadId, uploadUrl } = beginResp.data;

    // 6. Ticket is already persisted by SW — sync local state
    const ticket: UploadTicket = {
      uploadId,
      uploadUrl,
      storageId: null,
      sha256,
      name: file.name,
      kind,
      state: "beginning",
      createdAt: Date.now(),
    };
    persistTicket(ticket);

    // Store preview URL
    previewUrlsRef.current[uploadId] = previewUrl;
    setPreviewUrls((prev) => ({ ...prev, [uploadId]: previewUrl }));

    // 7. Add to form slot/attachment list
    if (kind === "image") {
      setForm((prev) => ({
        ...prev,
        imageUploadIds: [...prev.imageUploadIds, uploadId].slice(0, MAX_IMAGE_UPLOADS),
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        attachmentIds: [...prev.attachmentIds, uploadId].slice(0, MAX_ATTACHMENTS),
      }));
    }

    // 8. Update to uploading state
    updateTicket(uploadId, { state: "uploading" });
    setUploadProgress((prev) => ({ ...prev, [uploadId]: 0 }));

    // 9. Upload bytes directly (NO BSP auth header)
    let storageId: string;
    try {
      storageId = await uploadBytesWithProgress(
        uploadUrl,
        await file.arrayBuffer(),
        file.type,
        (pct) => setUploadProgress((prev) => ({ ...prev, [uploadId]: pct }))
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      updateTicket(uploadId, { state: "cleanup-needed" });
      setUploadErrors((prev) => ({ ...prev, [uploadId]: msg }));
      return;
    }

    // 10. Update to uploaded-awaiting-finish with storageId
    updateTicket(uploadId, { state: "uploaded-awaiting-finish", storageId });

    // 11. FINISH via service worker
    await doFinishUpload(uploadId, storageId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.imageUploadIds.length, form.attachmentIds.length, persistTicket, updateTicket]);

  const doFinishUpload = useCallback(async (uploadId: string, storageId: string) => {
    const finishResp = await new Promise<MessageResponse<{ uploadId: string }>>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "FINISH_UPLOAD", uploadId, storageId },
        (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message ?? "Finish failed" });
          } else {
            resolve(resp as MessageResponse<{ uploadId: string }>);
          }
        }
      );
    });

    if (finishResp.ok) {
      updateTicket(uploadId, { state: "ready" });
      setUploadErrors((prev) => {
        const next = { ...prev };
        delete next[uploadId];
        return next;
      });
    } else {
      // Keep in uploaded-awaiting-finish state for recovery
      setUploadErrors((prev) => ({
        ...prev,
        [uploadId]: `Finish failed: ${finishResp.error}. Bytes uploaded but not confirmed — retry to complete.`,
      }));
    }
  }, [updateTicket]);

  // ── Interruption recovery (retry finish) ───────────────────────────────────

  const handleRetryFinish = useCallback(async (ticket: UploadTicket) => {
    if (!ticket.storageId) return;
    setUploadErrors((prev) => {
      const next = { ...prev };
      delete next[ticket.uploadId];
      return next;
    });
    updateTicket(ticket.uploadId, { state: "uploaded-awaiting-finish" });
    await doFinishUpload(ticket.uploadId, ticket.storageId);
    setRecoveryTickets((prev) => prev.filter((t) => t.uploadId !== ticket.uploadId));
  }, [doFinishUpload, updateTicket]);

  // ── Upload file button handlers ─────────────────────────────────────────────

  const triggerImageUpload = useCallback(() => {
    pendingUploadKindRef.current = "image";
    imageFileInputRef.current?.click();
  }, []);

  const triggerAttachmentUpload = useCallback(() => {
    pendingUploadKindRef.current = "attachment";
    attachmentFileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelected(file);
      e.target.value = ""; // reset so same file can be selected again
    },
    [handleFileSelected]
  );

  // ── Remove upload ticket (with discard) ────────────────────────────────────

  const handleRemoveUpload = useCallback(
    async (uploadId: string) => {
      const ticket = uploadTickets[uploadId];
      if (!ticket) return;

      // Never discard attached tickets
      if (ticket.state === "attached") return;

      // Remove from form state
      setForm((prev) => ({
        ...prev,
        imageUploadIds: prev.imageUploadIds.filter((id) => id !== uploadId),
        attachmentIds: prev.attachmentIds.filter((id) => id !== uploadId),
      }));

      // Revoke preview URL
      if (previewUrlsRef.current[uploadId]) {
        URL.revokeObjectURL(previewUrlsRef.current[uploadId]);
        delete previewUrlsRef.current[uploadId];
        setPreviewUrls((prev) => {
          const next = { ...prev };
          delete next[uploadId];
          return next;
        });
      }

      // If ticket is in "ready" state, attempt discard
      if (ticket.state === "ready") {
        const discardResp = await new Promise<MessageResponse<{ discarded: boolean }>>(
          (resolve) => {
            chrome.runtime.sendMessage(
              { type: "DISCARD_UPLOAD", uploadId },
              (resp) => {
                if (chrome.runtime.lastError) {
                  resolve({ ok: false, error: chrome.runtime.lastError.message ?? "Discard failed" });
                } else {
                  resolve(resp as MessageResponse<{ discarded: boolean }>);
                }
              }
            );
          }
        );

        if (!discardResp.ok) {
          // discard API failed — ticket may be orphaned
          updateTicket(uploadId, { state: "cleanup-needed" });
          return;
        }

        // discarded: false is ambiguous — not confirmed success
        if (!discardResp.data.discarded) {
          // Mark as cleanup-needed; do not claim success
          updateTicket(uploadId, { state: "cleanup-needed" });
          return;
        }
      }

      // Remove ticket from storage
      removeTicketFromStorage(uploadId);
      setUploadErrors((prev) => {
        const next = { ...prev };
        delete next[uploadId];
        return next;
      });
    },
    [uploadTickets, updateTicket, removeTicketFromStorage]
  );

  // ── Load draft on mount ─────────────────────────────────────────────────────

  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "LOAD_DRAFT" },
      (response: MessageResponse<{ draft: DraftRecord | null; pending: unknown }>) => {
        if (chrome.runtime.lastError || !response.ok) {
          setDraftLoaded(true);
          return;
        }
        const { draft } = response.data;
        if (!draft) {
          setDraftLoaded(true);
          return;
        }

        if (draft.sourceUrl === activeTabUrl || !activeTabUrl) {
          setForm(draft.form);
          setDraftBanner(`Draft restored — ${new Date(draft.savedAt).toLocaleTimeString()}`);
        } else {
          const replace = window.confirm(
            `A draft exists for a different page:\n${draft.sourceUrl}\n\nReplace it?`
          );
          if (!replace) {
            setForm(draft.form);
            setDraftBanner(`Draft from ${draft.sourceUrl}`);
          }
        }
        setDraftLoaded(true);
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handle pending candidate ───────────────────────────────────────────────

  // Special __CLEAR__ sentinel from App header button
  useEffect(() => {
    if (!pendingCandidate) return;
    if (pendingCandidate.imageUrl === "__CLEAR__") {
      const confirmed = window.confirm("Clear all fields? Your draft will also be cleared.");
      if (confirmed) {
        handleClearDraft();
      }
      onCandidateConsumed();
      return;
    }

    if (!draftLoaded) return;

    const isDirty =
      form.title.trim() !== "" ||
      form.imageUrls.length > 0 ||
      form.cost.trim() !== "";
    const isSameSource =
      pendingCandidate.sourceUrl === form.sourceUrl ||
      (pendingCandidate.cardLink && pendingCandidate.cardLink === form.sourceUrl);

    if (isDirty && !isSameSource) {
      setConflictPending(pendingCandidate);
    } else {
      applyCandidate(pendingCandidate);
      onCandidateConsumed();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCandidate, draftLoaded]);

  // ── Apply candidate ────────────────────────────────────────────────────────

  function applyCandidate(candidate: PendingCandidate): void {
    const newAutoFilled: AutoFilledFields = new Set();

    setForm((prev) => {
      const updated = { ...prev };
      const sourceUrl = candidate.cardLink || candidate.sourceUrl;
      updated.sourceUrl = sourceUrl;
      newAutoFilled.add("sourceUrl");

      if (candidate.cardTitle) {
        updated.title = candidate.cardTitle;
        newAutoFilled.add("title");
      }

      if (candidate.cardPrice !== undefined && candidate.cardPrice > 0) {
        updated.cost = String(candidate.cardPrice);
        newAutoFilled.add("cost");
      }

      const existingUrls = prev.imageUrls;
      if (candidate.imageUrl && !existingUrls.includes(candidate.imageUrl)) {
        const newUrls = [candidate.imageUrl, ...existingUrls].slice(0, 10);
        updated.imageUrls = newUrls;
        updated.selectedImageIndexes = newUrls.map((_, i) => i < 5);
        newAutoFilled.add("imageUrls");
      } else if (!existingUrls.includes(candidate.imageUrl)) {
        updated.imageUrls = [candidate.imageUrl];
        updated.selectedImageIndexes = [true];
        newAutoFilled.add("imageUrls");
      }

      return updated;
    });

    setAutoFilled(newAutoFilled);
    setDraftBanner("Hover capture — verify details before saving");
  }

  // ── Clear draft (with upload discard) ─────────────────────────────────────

  const handleClearDraft = useCallback(async () => {
    // Discard all ready (not attached) tickets
    const allIds = [...form.imageUploadIds, ...form.attachmentIds];
    for (const uploadId of allIds) {
      const ticket = uploadTickets[uploadId];
      if (!ticket || ticket.state === "attached") continue;
      if (ticket.state === "ready") {
        // Best-effort discard — show result but continue clearing
        const discardResp = await new Promise<MessageResponse<{ discarded: boolean }>>((resolve) => {
          chrome.runtime.sendMessage(
            { type: "DISCARD_UPLOAD", uploadId },
            (resp) => {
              if (chrome.runtime.lastError) {
                resolve({ ok: false, error: chrome.runtime.lastError.message ?? "Discard failed" });
              } else {
                resolve(resp as MessageResponse<{ discarded: boolean }>);
              }
            }
          );
        });

        if (!discardResp.ok || !discardResp.data?.discarded) {
          // Mark as cleanup-needed; bytes may be orphaned
          updateTicket(uploadId, { state: "cleanup-needed" });
        } else {
          removeTicketFromStorage(uploadId);
        }
      } else {
        // In-progress or other non-ready — just mark cleanup-needed
        updateTicket(uploadId, { state: "cleanup-needed" });
      }

      // Revoke preview
      if (previewUrlsRef.current[uploadId]) {
        URL.revokeObjectURL(previewUrlsRef.current[uploadId]);
        delete previewUrlsRef.current[uploadId];
      }
    }
    setPreviewUrls({});

    setForm(defaultForm(activeTabUrl));
    setAutoFilled(new Set());
    setDraftBanner(null);
    setPriceCandidates([]);
    setCurrencyWarning(null);
    setSaveState({ status: "idle" });
    setUploadErrors({});
    chrome.runtime.sendMessage({ type: "CLEAR_DRAFT" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.imageUploadIds, form.attachmentIds, uploadTickets, updateTicket, removeTicketFromStorage, activeTabUrl]);

  // ── Auto-save draft ────────────────────────────────────────────────────────

  const saveDraftDebounced = useCallback(
    (f: ProductFormState) => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        const draft: DraftRecord = {
          sourceUrl: f.sourceUrl || activeTabUrl,
          form: f,
          savedAt: Date.now(),
        };
        chrome.runtime.sendMessage({ type: "SAVE_DRAFT", draft });
      }, 800);
    },
    [activeTabUrl]
  );

  useEffect(() => {
    if (!draftLoaded) return;
    saveDraftDebounced(form);
  }, [form, draftLoaded, saveDraftDebounced]);

  useEffect(() => {
    setErrors(validateProductForm(form));
  }, [form]);

  // ── Form helpers ───────────────────────────────────────────────────────────

  function updateField<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function inp(key: keyof ProductFormState, extra?: React.InputHTMLAttributes<HTMLInputElement>) {
    return {
      style: {
        ...s.input,
        ...(errors[key as keyof typeof errors] ? s.inputError : {}),
      } as React.CSSProperties,
      value: form[key] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        updateField(key, e.target.value as ProductFormState[typeof key]),
      ...extra,
    };
  }

  function ta(key: keyof ProductFormState) {
    return {
      style: {
        ...s.textarea,
        ...(errors[key as keyof typeof errors] ? s.inputError : {}),
      } as React.CSSProperties,
      value: form[key] as string,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
        updateField(key, e.target.value as ProductFormState[typeof key]),
    };
  }

  // ── Pick / extract ────────────────────────────────────────────────────────

  async function pickText(field: keyof ProductFormState) {
    if (!activeTabId) return;
    const response = await new Promise<MessageResponse>((resolve) => {
      chrome.tabs.sendMessage(activeTabId, { type: "START_PICK_TEXT" }, resolve);
    });
    if (response?.ok && (response as { ok: true; data: string | null }).data) {
      updateField(field, (response as { ok: true; data: string }).data as ProductFormState[typeof field]);
    }
  }

  async function pickImage() {
    if (!activeTabId) return;
    const response = await new Promise<MessageResponse>((resolve) => {
      chrome.tabs.sendMessage(activeTabId, { type: "START_PICK_IMAGE" }, resolve);
    });
    if (response?.ok && (response as { ok: true; data: string | null }).data) {
      const url = (response as { ok: true; data: string }).data;
      addImageUrl(url);
    }
  }

  async function handleExtract() {
    if (!activeTabId) {
      setExtractError("No active tab to extract from");
      return;
    }
    setExtracting(true);
    setExtractError(null);
    setPriceCandidates([]);
    setCurrencyWarning(null);

    try {
      const response = await new Promise<MessageResponse<ExtractionResult>>((resolve) => {
        chrome.tabs.sendMessage(activeTabId, { type: "EXTRACT_PRODUCT" }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message ?? "Content script not ready" });
          } else {
            resolve(resp as MessageResponse<ExtractionResult>);
          }
        });
      });

      if (!response.ok) {
        const errMsg = response.error ?? "Extraction failed";
        setExtractError(
          errMsg.includes("Cannot access") || errMsg.includes("chrome://")
            ? "This page cannot be inspected. Enter product details manually."
            : errMsg
        );
        return;
      }

      const result = response.data;
      const newAutoFilled: AutoFilledFields = new Set();

      function applyField<K extends keyof ProductFormState>(key: K, value: ProductFormState[K] | undefined) {
        if (value !== undefined && value !== null) {
          updateField(key, value);
          newAutoFilled.add(key);
        }
      }

      applyField("title", result.title as string | undefined);
      applyField("sourceUrl", result.sourceUrl as string);
      applyField("description", result.description as string | undefined);
      applyField("supplierName", result.supplierName as string | undefined);
      applyField("manufacturer", result.manufacturer as string | undefined);
      applyField("sku", result.sku as string | undefined);
      applyField("dimensions", result.dimensions as string | undefined);
      applyField("finishColor", result.finishColor as string | undefined);
      applyField("composition", result.composition as string | undefined);
      applyField("category", result.category as string | undefined);

      if (result.imageUrls && result.imageUrls.length > 0) {
        const combined = [
          ...form.imageUrls,
          ...result.imageUrls.filter((u) => !form.imageUrls.includes(u)),
        ].slice(0, 10);
        setForm((prev) => ({
          ...prev,
          imageUrls: combined,
          selectedImageIndexes: combined.map(() => true),
        }));
        newAutoFilled.add("imageUrls");
      }

      if (result.cost !== undefined && !result.currencyWarning) {
        applyField("cost", String(result.cost) as ProductFormState["cost"]);
      }

      if (result.currencyWarning) setCurrencyWarning(result.currencyWarning);
      if (result.priceCandidates && result.priceCandidates.length > 1) {
        setPriceCandidates(result.priceCandidates);
      }

      setAutoFilled(newAutoFilled);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  // ── Image management (external URLs) ──────────────────────────────────────

  function addImageUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    setForm((prev) => {
      if (prev.imageUrls.includes(trimmed)) return prev;
      const newUrls = [...prev.imageUrls, trimmed].slice(0, 10);
      const newSelected = [
        ...prev.selectedImageIndexes,
        prev.selectedImageIndexes.length < 5,
      ];
      return { ...prev, imageUrls: newUrls, selectedImageIndexes: newSelected };
    });
  }

  function removeImage(index: number) {
    setForm((prev) => ({
      ...prev,
      imageUrls: prev.imageUrls.filter((_, i) => i !== index),
      selectedImageIndexes: prev.selectedImageIndexes.filter((_, i) => i !== index),
    }));
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const hasErrors = Object.keys(errors).length > 0;

  // Collect ready uploadIds for the save payload
  const readyUploadIds = new Set(
    Object.values(uploadTickets)
      .filter((t) => t.state === "ready")
      .map((t) => t.uploadId)
  );
  const saveUploadIds = buildUploadIds(form.imageUploadIds, form.attachmentIds, readyUploadIds);

  // Block save while any upload is in-progress
  const hasInProgressUploads = Object.values(uploadTickets).some(
    (t) =>
      (form.imageUploadIds.includes(t.uploadId) || form.attachmentIds.includes(t.uploadId)) &&
      (t.state === "beginning" || t.state === "uploading" || t.state === "uploaded-awaiting-finish")
  );

  async function handleSave() {
    if (hasErrors || saveState.status === "saving" || hasInProgressUploads) return;
    if (destinationBlocked) return;
    const requestId = crypto.randomUUID();
    const destination = buildDestination(destinationState);
    const payload = buildSavePayload(form, requestId, saveUploadIds, destination);
    await doSave(payload);
  }

  async function handleRetry(frozenPayload: ProductSavePayload) {
    await doSave(frozenPayload);
  }

  async function doSave(payload: ProductSavePayload) {
    setSaveState({ status: "saving" });

    const response = await new Promise<MessageResponse<SaveApiResponse>>((resolve) => {
      chrome.runtime.sendMessage({ type: "SAVE_PRODUCT", payload }, (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message ?? "Unknown error" });
        } else {
          resolve(resp as MessageResponse<SaveApiResponse>);
        }
      });
    });

    if (response.ok) {
      const data = response.data;
      setSaveState({
        status: "success",
        materialId: data.materialId,
        path: data.path,
        replayed: data.replayed,
        selectionId: data.selectionId,
        selectionPath: data.selectionPath,
      });
      chrome.runtime.sendMessage({ type: "CLEAR_DRAFT" });

      // Mark all included upload tickets as "attached"
      for (const uploadId of payload.uploadIds) {
        updateTicket(uploadId, { state: "attached" });
      }
    } else {
      const errMsg = response.error ?? "Save failed";
      if (errMsg.startsWith("UNKNOWN:")) {
        const realMsg = errMsg.slice("UNKNOWN:".length);
        setSaveState({ status: "unknown", requestId: payload.requestId, frozenPayload: payload, error: realMsg });
      } else {
        const status400 = errMsg.includes("400");
        const status401 = errMsg.includes("401");
        const status403 = errMsg.includes("403") || errMsg.includes("Forbidden") || errMsg.includes("forbidden");
        const status404 = errMsg.includes("404") || errMsg.includes("Not Found") || errMsg.includes("not found");
        const status409 = errMsg.includes("409") || errMsg.includes("Conflict") || errMsg.includes("conflict");
        const status413 = errMsg.includes("413") || errMsg.includes("too large");
        setSaveState({
          status: "error",
          error: errMsg,
          keepDraft: !status400 || status401 || status413,
          is404: status404,
          is409: status409,
          is403: status403,
        });
      }
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const isSaving = saveState.status === "saving";

  // Destination-specific blocking: board mode selected but no board chosen
  const destinationBlocked =
    destinationState.mode === "board" &&
    !!destinationState.projectId &&
    !destinationState.boardId;

  const saveDisabled = hasErrors || isSaving || !isConnected || hasInProgressUploads || destinationBlocked;

  const libraryLink =
    saveState.status === "success" && bspOrigin
      ? `${bspOrigin}/library/my-items?tab=materials&materialId=${saveState.materialId}`
      : null;

  // Board link — only if selectionPath is present and starts with /projects/
  const boardLink =
    saveState.status === "success" &&
    bspOrigin &&
    saveState.selectionPath?.startsWith("/projects/")
      ? `${bspOrigin}${saveState.selectionPath}`
      : null;

  // Map form images to the 5-slot grid (cover + 4)
  const SLOT_COUNT = 5;
  const selectedUrls = form.imageUrls.filter((_, i) => form.selectedImageIndexes[i]);

  // Build slot data: uploads first, then external URLs
  type SlotData =
    | { type: "upload"; uploadId: string; previewUrl?: string }
    | { type: "url"; url: string; urlIndex: number }
    | { type: "empty" };

  const slotData: SlotData[] = [];
  for (const uid of form.imageUploadIds) {
    if (slotData.length >= SLOT_COUNT) break;
    slotData.push({ type: "upload", uploadId: uid, previewUrl: previewUrls[uid] });
  }
  const selectedExternalUrls = form.imageUrls
    .map((url, i) => ({ url, i }))
    .filter(({ i }) => form.selectedImageIndexes[i]);
  for (const { url, i } of selectedExternalUrls) {
    if (slotData.length >= SLOT_COUNT) break;
    slotData.push({ type: "url", url, urlIndex: i });
  }
  while (slotData.length < SLOT_COUNT) {
    slotData.push({ type: "empty" });
  }

  // Cover determination (backend rule)
  const firstReadyUploadSlotIdx = slotData.findIndex(
    (s) => s.type === "upload" && uploadTickets[(s as { type: "upload"; uploadId: string }).uploadId]?.state === "ready"
  );
  const coverSlotIdx =
    firstReadyUploadSlotIdx >= 0
      ? firstReadyUploadSlotIdx
      : slotData[0].type !== "empty"
      ? 0
      : -1;

  const usedCount = slotData.filter((s) => s.type !== "empty").length;
  const pricingPreview = computePricingPreview(form.cost, form.markupPercent, form.quantity);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={s.container}>
      {/* Hidden file inputs */}
      <input
        ref={imageFileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.gif"
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />
      <input
        ref={attachmentFileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.gif,.pdf"
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />

      {/* Draft conflict dialog */}
      {conflictPending && (
        <div style={s.conflictOverlay}>
          <div style={s.conflictDialog}>
            <div style={s.conflictTitle}>Start new capture?</div>
            <div style={s.conflictBody}>
              You have an unsaved draft. Starting a new capture will load the hovered product
              into the form. Your existing draft remains saved and can be restored by
              navigating back to that page.
            </div>
            <div style={s.conflictBtnRow}>
              <button
                style={s.conflictBtnSecondary}
                onClick={() => { setConflictPending(null); onCandidateConsumed(); }}
                type="button"
              >
                Keep current
              </button>
              <button
                style={s.conflictBtnPrimary}
                onClick={() => {
                  const c = conflictPending;
                  setConflictPending(null);
                  applyCandidate(c);
                  onCandidateConsumed();
                }}
                type="button"
              >
                Start new
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draft banner */}
      {draftBanner && (
        <div style={s.draftBanner}>
          <span>{draftBanner}</span>
          <button
            style={{ background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 14, padding: "0 2px" }}
            onClick={() => setDraftBanner(null)}
            type="button"
            aria-label="Dismiss"
          >×</button>
        </div>
      )}

      {/* Interruption recovery banner */}
      {recoveryTickets.length > 0 && (
        <div style={s.recoveryBanner}>
          <strong>{recoveryTickets.length} upload(s) need finish retry</strong> (bytes uploaded but not confirmed):
          {recoveryTickets.map((t) => (
            <div key={t.uploadId} style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
              <button
                style={{ fontSize: 11, padding: "2px 8px", background: "#B8962E", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
                type="button"
                onClick={() => handleRetryFinish(t)}
              >
                Retry
              </button>
              <button
                style={{ fontSize: 11, padding: "2px 6px", background: "none", color: "#888", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}
                type="button"
                onClick={() => setRecoveryTickets((prev) => prev.filter((r) => r.uploadId !== t.uploadId))}
              >
                Dismiss
              </button>
            </div>
          ))}
          <div style={{ fontSize: 10, color: "#856404", marginTop: 4 }}>
            Note: if retry fails repeatedly, bytes may be orphaned on the storage server.
          </div>
        </div>
      )}

      {/* ── Image grid ───────────────────────────────────────────── */}
      <div style={s.imageSection}>
        {/* Cover info when mixed sources */}
        {form.imageUploadIds.length > 0 && selectedUrls.length > 0 && (
          <div style={{ fontSize: 10, color: "#B8962E", marginBottom: 6 }}>
            ℹ Uploaded images are cover; external URLs are additional.
          </div>
        )}
        <div style={s.imageGrid}>
          {slotData.map((slot, slotIdx) => {
            const isPrimary = slotIdx === 0;
            const isCover = slotIdx === coverSlotIdx;

            if (slot.type === "upload") {
              const ticket = uploadTickets[slot.uploadId];
              return (
                <ImageSlot
                  key={`upload-${slot.uploadId}`}
                  index={slotIdx}
                  url={slot.previewUrl}
                  isCover={isCover}
                  isPrimary={isPrimary}
                  uploadTicket={ticket}
                  uploadProgress={uploadProgress[slot.uploadId]}
                  uploadError={uploadErrors[slot.uploadId]}
                  onRemove={ticket?.state !== "attached" ? () => handleRemoveUpload(slot.uploadId) : undefined}
                  onRetryUpload={
                    ticket?.state === "uploaded-awaiting-finish" && ticket.storageId
                      ? () => handleRetryFinish(ticket)
                      : undefined
                  }
                  activeTabId={activeTabId}
                />
              );
            }

            if (slot.type === "url") {
              return (
                <ImageSlot
                  key={`url-${slot.urlIndex}`}
                  index={slotIdx}
                  url={slot.url}
                  isCover={isCover}
                  isPrimary={isPrimary}
                  onRemove={() => removeImage(slot.urlIndex)}
                  onPickFromPage={pickImage}
                  onAddUrl={addImageUrl}
                  onUploadFile={triggerImageUpload}
                  activeTabId={activeTabId}
                />
              );
            }

            // Empty slot
            return (
              <ImageSlot
                key={`empty-${slotIdx}`}
                index={slotIdx}
                isPrimary={isPrimary}
                onPickFromPage={pickImage}
                onAddUrl={addImageUrl}
                onUploadFile={triggerImageUpload}
                activeTabId={activeTabId}
              />
            );
          })}
        </div>
        <div style={s.imageCountBadge}>
          {usedCount}/{SLOT_COUNT} images
          {errors.imageUrls && (
            <span style={{ color: "#c0392b", marginLeft: 6 }}>{errors.imageUrls}</span>
          )}
        </div>
        {/* Quick add URL below grid */}
        <div style={s.addUrlRow}>
          <input
            style={s.addUrlInput}
            type="url"
            placeholder="Paste image URL…"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { addImageUrl(urlInput); setUrlInput(""); }
            }}
          />
          <button style={s.addUrlBtn} onClick={() => { addImageUrl(urlInput); setUrlInput(""); }} type="button">
            Add URL
          </button>
          <button style={s.pickBtn} onClick={pickImage} type="button">
            Pick
          </button>
        </div>
        {/* Validation errors from file selection */}
        {uploadErrors["limit-img"] && (
          <div style={{ ...s.errorText, marginTop: 4 }}>{uploadErrors["limit-img"]}</div>
        )}
      </div>

      {/* ── Title & source URL ────────────────────────────────────── */}
      <div style={s.titleSection}>
        <div style={{ display: "flex", gap: 4, alignItems: "stretch", marginBottom: 6 }}>
          <input
            style={{
              ...s.titleInput,
              marginBottom: 0,
              flex: 1,
              ...(errors.title ? s.titleInputError : {}),
            }}
            placeholder="Product title (required)"
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            maxLength={500}
          />
          <button
            style={{ ...s.pickBtn, alignSelf: "stretch", fontSize: 12 }}
            onClick={() => pickText("title")}
            type="button"
            title="Click a text element on the page"
          >
            Pick
          </button>
        </div>
        {errors.title && <div style={{ ...s.errorText, marginBottom: 4 }}>{errors.title}</div>}
        {autoFilled.has("title") && (
          <div style={{ fontSize: 10, color: "#B8962E", marginBottom: 4 }}>Title auto-filled from page</div>
        )}

        <div style={s.sourceUrlRow}>
          <span style={{ color: "#aaa", flexShrink: 0, fontSize: 10 }}>URL:</span>
          {editingSourceUrl ? (
            <input
              style={s.sourceUrlInput}
              value={form.sourceUrl}
              onChange={(e) => updateField("sourceUrl", e.target.value)}
              onBlur={() => setEditingSourceUrl(false)}
              autoFocus
              maxLength={8192}
              placeholder="https://…"
            />
          ) : (
            <>
              <span
                style={{ ...s.sourceUrlText, cursor: "pointer" }}
                onClick={() => setEditingSourceUrl(true)}
                title={form.sourceUrl || "(none)"}
              >
                {form.sourceUrl || <span style={{ color: "#ccc" }}>(none)</span>}
              </span>
              <button
                style={{ background: "none", border: "none", cursor: "pointer", color: "#B8962E", fontSize: 10, padding: 0, flexShrink: 0 }}
                onClick={() => setEditingSourceUrl(true)}
                type="button"
              >
                edit
              </button>
            </>
          )}
        </div>
        {errors.sourceUrl && <div style={s.errorText}>{errors.sourceUrl}</div>}
      </div>

      {/* ── Extract button ────────────────────────────────────────── */}
      <div style={{ ...s.formSection, paddingBottom: 0 }}>
        <button
          style={{
            width: "100%",
            padding: "8px 0",
            background: "#f0f0f0",
            color: "#444",
            border: "1px solid #e0e0e0",
            borderRadius: 5,
            fontSize: 12,
            fontWeight: 600,
            cursor: extracting || !activeTabId ? "not-allowed" : "pointer",
            marginBottom: 8,
            opacity: !activeTabId ? 0.6 : 1,
          }}
          onClick={handleExtract}
          disabled={extracting || !activeTabId}
          type="button"
        >
          {extracting ? "Extracting…" : "↓ Extract all fields from page"}
        </button>
        {extractError && <div style={{ ...s.warning, marginBottom: 8 }}>{extractError}</div>}
        {currencyWarning && <div style={{ ...s.warning, marginBottom: 8 }}>{currencyWarning}</div>}
      </div>

      {/* ── Price candidates ──────────────────────────────────────── */}
      {priceCandidates.length > 1 && (
        <div style={s.formSection}>
          <div style={s.sectionTitle}>Multiple prices found — pick one</div>
          <div style={s.priceCandidateList}>
            {priceCandidates.map((c, i) => (
              <div key={i} style={s.priceCandidateItem}>
                <button
                  style={s.priceCandidateBtn}
                  onClick={() => { updateField("cost", String(c.value)); setPriceCandidates([]); }}
                  type="button"
                >
                  ${c.value.toFixed(2)}
                </button>
                <span style={{ color: "#666", fontSize: 11 }}>{c.context}</span>
              </div>
            ))}
            <button
              style={{ ...s.addUrlBtn, marginTop: 2, width: "fit-content" }}
              onClick={() => setPriceCandidates([])}
              type="button"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ── Pricing ───────────────────────────────────────────────── */}
      <div style={s.formSection}>
        <div style={s.sectionTitle}>Pricing</div>
        <div style={s.row2}>
          <Field label="Cost (USD)" error={errors.cost} autoFilled={autoFilled.has("cost")}>
            <input {...inp("cost", { type: "number", min: "0", step: "0.01", placeholder: "Leave blank if unknown" })} />
          </Field>
          <Field label="Markup %" error={errors.markupPercent}>
            <input {...inp("markupPercent", { type: "number", min: "0", max: "1000", step: "0.1" })} />
          </Field>
        </div>
        <div style={s.row2}>
          <Field label="Quantity" error={errors.quantity}>
            <input {...inp("quantity", { type: "number", min: "0.001", step: "any" })} />
          </Field>
          <Field label="Unit" error={errors.unit}>
            <input {...inp("unit", { placeholder: "each", maxLength: 500 })} />
          </Field>
        </div>
        <div style={s.row2}>
          <Field label="MSRP (USD)" error={errors.msrp}>
            <input {...inp("msrp", { type: "number", min: "0", step: "0.01", placeholder: "Optional" })} />
          </Field>
          <Field label=" ">
            <label style={s.checkboxRow}>
              <input
                type="checkbox"
                style={s.checkbox}
                checked={form.taxable}
                onChange={(e) => updateField("taxable", e.target.checked)}
              />
              Taxable
            </label>
          </Field>
        </div>
        {/* Selling price preview */}
        <div style={s.pricingPreviewRow}>
          {pricingPreview.hasPrice && pricingPreview.unitSellingPrice !== null ? (
            <span>
              Unit <strong>${pricingPreview.unitSellingPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              {pricingPreview.total !== null && (
                <> · Total <strong>${pricingPreview.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></>
              )}
            </span>
          ) : (
            <span style={{ color: "#bbb" }}>Price unknown</span>
          )}
        </div>
      </div>

      {/* ── Product info ───────────────────────────────────────────── */}
      <div style={s.formSection}>
        <div style={s.sectionTitle}>Product Info</div>
        <Field
          label="Client description"
          error={errors.description}
          autoFilled={autoFilled.has("description")}
        >
          <textarea {...ta("description")} rows={3} maxLength={20000} />
        </Field>
        <div style={s.row2}>
          <Field label="Category" error={errors.category} autoFilled={autoFilled.has("category")}>
            <input {...inp("category", { placeholder: "e.g. Copper Bathtub", maxLength: 500 })} />
          </Field>
          <Field label="Vendor / Supplier" autoFilled={autoFilled.has("supplierName")}>
            <input {...inp("supplierName", { placeholder: "Supplier name", maxLength: 200 })} />
          </Field>
        </div>
      </div>

      {/* ── Destination ────────────────────────────────────────────── */}
      <div style={s.accordionSection}>
        <button
          style={s.accordionHeader}
          onClick={() => setShowDestination((v) => !v)}
          type="button"
          aria-expanded={showDestination}
        >
          <span>
            Destination
            {destinationState.mode === "board" && destinationState.boardId && (
              <span style={{
                marginLeft: 6,
                background: "#B8962E",
                color: "#fff",
                fontSize: 9,
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: 8,
              }}>Board</span>
            )}
          </span>
          <span style={{ fontSize: 12, color: "#aaa" }}>{showDestination ? "▲" : "▼"}</span>
        </button>
        {showDestination && (
          <div style={s.accordionContent}>
            <DestinationSelector
              bspOrigin={bspOrigin}
              onChange={setDestinationState}
            />
            {destinationBlocked && (
              <div style={{
                fontSize: 11,
                color: "#856404",
                background: "#fff8e1",
                border: "1px solid #f0c040",
                borderRadius: 4,
                padding: "5px 9px",
                marginTop: 6,
              }}>
                Select a board to save to it
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Attachments ─────────────────────────────────────────────── */}
      <div style={s.accordionSection}>
        <button
          style={s.accordionHeader}
          onClick={() => setShowAttachments((v) => !v)}
          type="button"
          aria-expanded={showAttachments}
        >
          <span>
            Attachments
            {form.attachmentIds.length > 0 && (
              <span style={{
                marginLeft: 6,
                background: "#e0e0e0",
                color: "#555",
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: 8,
              }}>
                {form.attachmentIds.length}
              </span>
            )}
          </span>
          <span style={{ fontSize: 12, color: "#aaa" }}>{showAttachments ? "▲" : "▼"}</span>
        </button>
        {showAttachments && (
          <div style={s.accordionContent}>
            {form.attachmentIds.length === 0 ? (
              <div style={{ fontSize: 12, color: "#aaa", padding: "4px 0" }}>
                No attachments yet.
              </div>
            ) : (
              form.attachmentIds.map((uid) => {
                const ticket = uploadTickets[uid];
                if (!ticket) return null;
                const isInProgress =
                  ticket.state === "beginning" ||
                  ticket.state === "uploading" ||
                  ticket.state === "uploaded-awaiting-finish";
                const fileSizeKb = ""; // size not stored in ticket
                return (
                  <div key={uid} style={s.attachmentRow}>
                    <span style={s.attachmentName} title={ticket.name}>{ticket.name}</span>
                    {uploadProgress[uid] !== undefined && ticket.state === "uploading" && (
                      <span style={s.attachmentSize}>{uploadProgress[uid]}%</span>
                    )}
                    <span style={stateBadgeStyle(ticket.state)}>
                      {stateLabel(ticket.state, uploadProgress[uid])}
                    </span>
                    {!isInProgress && ticket.state !== "attached" && (
                      <button
                        style={s.attachmentRemoveBtn}
                        type="button"
                        onClick={() => handleRemoveUpload(uid)}
                        title="Remove"
                        aria-label={`Remove attachment ${ticket.name}`}
                      >
                        ×
                      </button>
                    )}
                    {uploadErrors[uid] && (
                      <span style={{ fontSize: 9, color: "#c0392b", maxWidth: 80, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }} title={uploadErrors[uid]}>
                        Error
                      </span>
                    )}
                  </div>
                );
              })
            )}

            {form.attachmentIds.length < MAX_ATTACHMENTS && (
              <button
                style={s.uploadFileBtn}
                type="button"
                onClick={triggerAttachmentUpload}
              >
                + Upload file ({form.attachmentIds.length}/{MAX_ATTACHMENTS})
              </button>
            )}
            {form.attachmentIds.length >= MAX_ATTACHMENTS && (
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>
                Maximum 10 attachments reached.
              </div>
            )}
            {uploadErrors["limit-att"] && (
              <div style={{ ...s.errorText, marginTop: 4 }}>{uploadErrors["limit-att"]}</div>
            )}

            <div style={{ fontSize: 10, color: "#aaa", marginTop: 6 }}>
              Supported: JPEG, PNG, WebP, GIF, PDF. Max 10 MB per file.
            </div>
          </div>
        )}
      </div>

      {/* ── Additional details ──────────────────────────────────────── */}
      <div style={s.accordionSection}>
        <button
          style={s.accordionHeader}
          onClick={() => setShowDetails((v) => !v)}
          type="button"
          aria-expanded={showDetails}
        >
          <span>Additional Details</span>
          <span style={{ fontSize: 12, color: "#aaa" }}>{showDetails ? "▲" : "▼"}</span>
        </button>
        {showDetails && (
          <div style={s.accordionContent}>
            <div style={s.row2}>
              <Field label="Manufacturer" autoFilled={autoFilled.has("manufacturer")}>
                <input {...inp("manufacturer", { placeholder: "Manufacturer", maxLength: 200 })} />
              </Field>
              <Field label="SKU" autoFilled={autoFilled.has("sku")}>
                <input {...inp("sku", { placeholder: "SKU", maxLength: 200 })} />
              </Field>
            </div>
            <div style={s.row2}>
              <Field label="Dimensions" autoFilled={autoFilled.has("dimensions")}>
                <input {...inp("dimensions", { placeholder: "e.g. 24.4″H×70.86″L", maxLength: 200 })} />
              </Field>
              <Field label="Finish / Color" autoFilled={autoFilled.has("finishColor")}>
                <input {...inp("finishColor", { placeholder: "e.g. Brushed Nickel", maxLength: 200 })} />
              </Field>
            </div>
            <Field label="Materials" autoFilled={autoFilled.has("composition")}>
              <input {...inp("composition", { placeholder: "e.g. Solid Oak", maxLength: 200 })} />
            </Field>
            <Field label="Description for vendor" style={{ marginTop: 4 }}>
              <textarea {...ta("vendorDescription")} rows={3} maxLength={20000} />
            </Field>
            <Field label="Internal notes">
              <textarea {...ta("internalNotes")} rows={3} maxLength={20000} />
            </Field>
            <Field label="Tags" error={errors.tags}>
              <input {...inp("tags", { placeholder: "tag1, tag2, tag3" })} />
              <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>
                Comma-separated, max 50 tags
              </div>
            </Field>
          </div>
        )}
      </div>

      {/* ── Sticky footer ────────────────────────────────────────────── */}
      <div style={s.footer}>
        {!isConnected && (
          <div style={{ fontSize: 11, color: "#c0392b", textAlign: "center", marginBottom: 6 }}>
            Not connected — configure settings first
          </div>
        )}
        {hasErrors && !isSaving && (
          <div style={{ fontSize: 11, color: "#c0392b", textAlign: "center", marginBottom: 6 }}>
            Fix the errors above before saving
          </div>
        )}
        {destinationBlocked && !isSaving && (
          <div style={{ fontSize: 11, color: "#856404", textAlign: "center", marginBottom: 6 }}>
            Select a board to save to it
          </div>
        )}
        {hasInProgressUploads && !isSaving && (
          <div style={{ fontSize: 11, color: "#856404", textAlign: "center", marginBottom: 6 }}>
            Waiting for uploads to finish…
          </div>
        )}

        <button
          style={{ ...s.saveBtn, ...(saveDisabled ? s.saveBtnDisabled : {}) }}
          onClick={handleSave}
          disabled={saveDisabled}
          type="button"
        >
          {isSaving
            ? "Saving…"
            : destinationState.mode === "board" && destinationState.boardId
            ? "Save to Library & Board"
            : "Save to Library"}
        </button>

        {saveState.status === "success" && (
          <div style={s.successBox}>
            {saveState.replayed ? (
              <strong>Already saved</strong>
            ) : (
              <strong>{boardLink ? "Saved to library & board!" : "Saved to library!"}</strong>
            )}
            {libraryLink && (
              <>{" "}<a href={libraryLink} target="_blank" rel="noreferrer" style={{ color: "#1a7a45" }}>Open in library</a></>
            )}
            {boardLink && (
              <>{" · "}<a href={boardLink} target="_blank" rel="noreferrer" style={{ color: "#1a7a45" }}>Open board</a></>
            )}
            {saveState.selectionId && !boardLink && (
              <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
                Saved to board selection.
              </div>
            )}
            {destinationState.selectionMode === "new" && saveState.selectionId && (
              <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
                New selection is private. Share it with your client from the board when ready.
              </div>
            )}
          </div>
        )}

        {saveState.status === "unknown" && (
          <div style={s.unknownOutcome}>
            <strong>Save outcome unknown</strong> — {saveState.error}
            <br />
            <button
              style={{ marginTop: 6, fontSize: 12, padding: "4px 10px", background: "#ffc107", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600 }}
              onClick={() => handleRetry(saveState.frozenPayload)}
              type="button"
            >
              Retry
            </button>
          </div>
        )}

        {saveState.status === "error" && (
          <div style={s.errorBox}>
            {saveState.is409 && (
              <strong>Conflict: </strong>
            )}
            {saveState.is403 && (
              <strong>Permission error: </strong>
            )}
            {saveState.error}
            {saveState.is404 && (
              <div style={{ marginTop: 4, fontSize: 10 }}>
                Board, project, or placeholder may no longer exist. Refresh your destination choices.
              </div>
            )}
            {saveState.is403 && (
              <div style={{ marginTop: 4, fontSize: 10 }}>
                Verify your connection in Settings, or switch to Library only.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
