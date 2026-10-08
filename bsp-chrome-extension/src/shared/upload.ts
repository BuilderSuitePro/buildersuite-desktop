/**
 * Upload utilities – pure functions safe to run in both the side panel and service worker.
 * No chrome API calls, no network calls.
 */

import type { UploadState, UploadKind } from "../types/index.js";

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_UPLOAD_BYTES = 10_485_760; // 10 MiB

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_ATTACHMENT_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const REJECTED_MIMES = new Set([
  "image/svg+xml",
  "image/heic",
  "image/heif",
  "image/avif",
]);

// ─── SHA-256 Base64 ───────────────────────────────────────────────────────────

/**
 * Compute SHA-256 of the given bytes and return as standard base64 (RFC 4648) with padding.
 * The result is always exactly 44 characters, ending with `=`.
 * NOT hex, NOT base64url.
 */
export async function computeSha256Base64(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashBytes = new Uint8Array(hashBuffer);
  // Convert to standard base64 via binary string → btoa
  let binaryStr = "";
  for (let i = 0; i < hashBytes.length; i++) {
    binaryStr += String.fromCharCode(hashBytes[i]);
  }
  return btoa(binaryStr);
}

// ─── File Validation ──────────────────────────────────────────────────────────

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a file for upload.
 * - Non-empty and ≤ 10 MiB
 * - MIME must be in the allowed set for the given kind
 * - Explicitly rejected formats (SVG, HEIC, AVIF) return a descriptive error
 * - Filename must pass validateUploadFilename
 */
export function validateUploadFile(file: File, kind: UploadKind): FileValidationResult {
  if (file.size === 0) {
    return { valid: false, error: "File is empty." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1_048_576).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${mb} MB). Maximum is 10 MB.`,
    };
  }

  const mime = file.type.toLowerCase();

  if (REJECTED_MIMES.has(mime)) {
    if (mime === "image/svg+xml") {
      return {
        valid: false,
        error:
          "SVG files are not supported. Please convert to JPEG, PNG, or WebP and try again.",
      };
    }
    if (mime === "image/heic" || mime === "image/heif") {
      return {
        valid: false,
        error:
          "HEIC/HEIF files are not supported. Please convert to JPEG or PNG and try again.",
      };
    }
    if (mime === "image/avif") {
      return {
        valid: false,
        error:
          "AVIF files are not supported. Please convert to JPEG, PNG, or WebP and try again.",
      };
    }
    return {
      valid: false,
      error: `File type "${mime}" is not supported.`,
    };
  }

  const allowed = kind === "image" ? ALLOWED_IMAGE_MIMES : ALLOWED_ATTACHMENT_MIMES;
  if (!allowed.has(mime)) {
    const allowed_list =
      kind === "image"
        ? "JPEG, PNG, WebP, or GIF"
        : "JPEG, PNG, WebP, GIF, or PDF";
    return {
      valid: false,
      error: `File type "${file.type || "unknown"}" is not supported. Allowed: ${allowed_list}.`,
    };
  }

  return validateUploadFilename(file.name);
}

/**
 * Validate an upload filename.
 * - Trimmed length must be 1–255 characters
 * - No control characters (U+0000–U+001F, U+007F)
 * - No slash or backslash
 */
export function validateUploadFilename(name: string): FileValidationResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Filename is empty." };
  }
  if (trimmed.length > 255) {
    return { valid: false, error: "Filename is too long (max 255 characters)." };
  }
  // Control characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return { valid: false, error: "Filename contains invalid control characters." };
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return { valid: false, error: "Filename must not contain slashes." };
  }
  return { valid: true };
}

// ─── State Machine ────────────────────────────────────────────────────────────

/** All valid state transitions in the upload state machine. */
const VALID_TRANSITIONS: ReadonlyMap<UploadState, ReadonlySet<UploadState>> = new Map([
  ["local", new Set<UploadState>(["beginning"])],
  ["beginning", new Set<UploadState>(["uploading", "cleanup-needed"])],
  ["uploading", new Set<UploadState>(["uploaded-awaiting-finish", "cleanup-needed"])],
  ["uploaded-awaiting-finish", new Set<UploadState>(["ready", "cleanup-needed"])],
  ["ready", new Set<UploadState>(["attached", "cleanup-needed"])],
  ["attached", new Set<UploadState>([])],
  ["cleanup-needed", new Set<UploadState>([])],
]);

export function isValidStateTransition(from: UploadState, to: UploadState): boolean {
  return VALID_TRANSITIONS.get(from)?.has(to) ?? false;
}

// ─── Cover Priority ───────────────────────────────────────────────────────────

/**
 * Compute the effective cover source for a product.
 *
 * Backend rule (immutable):
 *   First `storageId`-backed image in the ordered uploadIds array wins.
 *   If none, imageUrls[0] is the external cover.
 *
 * @param imageUploadIds  Ordered list of image upload ticket IDs in slot order.
 * @param ticketStorageIds  Map from uploadId to storageId (null if not yet stored).
 * @param externalImageUrls  External imageUrls from form.
 * @returns { source: 'upload', uploadId } | { source: 'external', url } | null
 */
export function computeCoverSource(
  imageUploadIds: string[],
  ticketStorageIds: Record<string, string | null>,
  externalImageUrls: string[]
): { source: "upload"; uploadId: string } | { source: "external"; url: string } | null {
  for (const uid of imageUploadIds) {
    if (ticketStorageIds[uid] != null) {
      return { source: "upload", uploadId: uid };
    }
  }
  const firstExternal = externalImageUrls.find((u) => u.trim().length > 0);
  if (firstExternal) {
    return { source: "external", url: firstExternal };
  }
  return null;
}

// ─── uploadIds Construction ───────────────────────────────────────────────────

/**
 * Build the final uploadIds array for a save payload.
 * - Only "ready" tickets are included
 * - Images first (in slot order), then attachments (in list order)
 * - No duplicates
 * - Max 15 total
 */
export function buildUploadIds(
  imageUploadIds: string[],
  attachmentIds: string[],
  readyIds: ReadonlySet<string>
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of [...imageUploadIds, ...attachmentIds]) {
    if (readyIds.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }

  return result.slice(0, 15);
}
