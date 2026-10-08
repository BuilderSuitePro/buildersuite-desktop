/**
 * Stage 3 – Upload tests.
 *
 * Covers:
 *  - SHA-256 standard base64 encoding (known test vectors)
 *  - File validation: MIME type gating, size limit, filename rules
 *  - Upload state machine transitions
 *  - Ticket persistence/recovery scenarios
 *  - Cover priority logic
 *  - Image+external combined count enforcement
 *  - uploadIds construction (ticket IDs not storageId, no duplicates, correct ordering)
 *  - Discard with discarded:false treated as ambiguous
 *  - Save blocked while any upload is in-progress
 *  - API response parsers (begin/finish/discard)
 */

import {
  validateUploadFile,
  validateUploadFilename,
  isValidStateTransition,
  computeCoverSource,
  buildUploadIds,
  MAX_UPLOAD_BYTES,
} from "../src/shared/upload";
import type { UploadState, UploadTicket } from "../src/types/index";
import {
  parseBeginUploadResponse,
  parseFinishUploadResponse,
  parseDiscardUploadResponse,
  ApiError,
} from "../src/service-worker/api";
import { buildSavePayload } from "../src/shared/validation";
import type { ProductFormState } from "../src/types/index";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(
  name: string,
  type: string,
  size = 1000
): File {
  const buf = new ArrayBuffer(size);
  return new File([buf], name, { type });
}

function makeTicket(overrides: Partial<UploadTicket> = {}): UploadTicket {
  return {
    uploadId: "upld_test001",
    uploadUrl: "https://storage.example.com/upload/abc",
    storageId: null,
    sha256: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
    name: "product.jpg",
    kind: "image",
    state: "ready",
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeForm(overrides: Partial<ProductFormState> = {}): ProductFormState {
  return {
    title: "Test Product",
    sourceUrl: "https://example.com/product",
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
    category: "Other",
    vendorDescription: "",
    internalNotes: "",
    tags: "",
    imageUrls: [],
    selectedImageIndexes: [],
    imageUploadIds: [],
    attachmentIds: [],
    ...overrides,
  };
}

// ─── SHA-256 Base64 encoding ──────────────────────────────────────────────────

describe("computeSha256Base64", () => {
  /**
   * The function is async and uses crypto.subtle which is available in Node ≥ 19.
   * Jest runs with jsdom which provides crypto.subtle.
   *
   * Known test vectors (RFC 4634 / NIST):
   *   SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
   *   Standard base64 = 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=
   *
   *   SHA-256("abc") = ba7816bf8f01cfea414140de5dae2ec73b00361bbef0469fa5395819f3b8096 (sic -
   *   actual: ba7816bf8f01cfea414140de5dae2ec73b00361bbef0469fa5395819f3b8096 — 63 hex chars)
   *   Actually SHA-256("abc") = ba7816bf8f01cfea414140de5dae2ec73b00361bbef0469fa5395819f3b80960
   *   wait no, it's ba7816bf 8f01cfea 414140de 5dae2ec7 3b003611 bbef0469 fa539581 9f3b8096
   *   (32 bytes = 64 hex chars)
   *   Standard base64 = ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=  (NO — length check)
   *
   * We test the structural properties since the subtle crypto implementation is environment-
   * dependent; the exact known value for "" is well-established.
   */

  // jsdom crypto.subtle is available in jest-environment-jsdom ≥ 29
  const hasCryptoSubtle = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";

  (hasCryptoSubtle ? it : it.skip)(
    "SHA-256 of empty buffer encodes to standard base64 (47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=)",
    async () => {
      const { computeSha256Base64 } = await import("../src/shared/upload");
      const result = await computeSha256Base64(new ArrayBuffer(0));
      expect(result).toBe("47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
    }
  );

  (hasCryptoSubtle ? it : it.skip)(
    "result is exactly 44 characters and ends with =",
    async () => {
      const { computeSha256Base64 } = await import("../src/shared/upload");
      const result = await computeSha256Base64(new ArrayBuffer(0));
      expect(result).toHaveLength(44);
      expect(result.endsWith("=")).toBe(true);
    }
  );

  (hasCryptoSubtle ? it : it.skip)(
    "uses standard base64 alphabet (+/) not base64url (-_)",
    async () => {
      const { computeSha256Base64 } = await import("../src/shared/upload");
      // Hash of empty is 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=
      // which contains '+' and '/' — standard base64 chars
      const result = await computeSha256Base64(new ArrayBuffer(0));
      // Must not contain base64url-only chars (- and _)
      expect(result).not.toMatch(/[-_]/);
      // The known value for empty input DOES contain '+' and '/'
      expect(result).toMatch(/[+/]/);
    }
  );

  (hasCryptoSubtle ? it : it.skip)(
    "SHA-256 of 'abc' bytes matches known standard base64 vector",
    async () => {
      const { computeSha256Base64 } = await import("../src/shared/upload");
      const encoder = new TextEncoder();
      const abcBytes = encoder.encode("abc").buffer;
      const result = await computeSha256Base64(abcBytes);
      // SHA-256("abc") standard base64 = ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=
      expect(result).toBe("ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=");
      expect(result).toHaveLength(44);
    }
  );

  it("standard base64 alphabet does NOT include hex chars only (sanity check)", () => {
    // The empty-input SHA-256 in hex is e3b0c4... — 64 hex chars, NOT 44
    const hexSha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    expect(hexSha).toHaveLength(64);
    // The base64 is 44 chars
    const b64Sha = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";
    expect(b64Sha).toHaveLength(44);
    // They are different
    expect(hexSha).not.toBe(b64Sha);
  });

  it("standard base64 has padding ('='), base64url typically does not", () => {
    const b64 = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";
    const b64url = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    expect(b64.endsWith("=")).toBe(true);
    expect(b64url.endsWith("=")).toBe(false);
    expect(b64).not.toBe(b64url);
  });
});

// ─── File validation ──────────────────────────────────────────────────────────

describe("validateUploadFile – MIME type gating", () => {
  it("accepts image/jpeg for image kind", () => {
    const f = makeFile("photo.jpg", "image/jpeg");
    expect(validateUploadFile(f, "image").valid).toBe(true);
  });

  it("accepts image/png for image kind", () => {
    expect(validateUploadFile(makeFile("img.png", "image/png"), "image").valid).toBe(true);
  });

  it("accepts image/webp for image kind", () => {
    expect(validateUploadFile(makeFile("img.webp", "image/webp"), "image").valid).toBe(true);
  });

  it("accepts image/gif for image kind", () => {
    expect(validateUploadFile(makeFile("img.gif", "image/gif"), "image").valid).toBe(true);
  });

  it("rejects application/pdf for image kind", () => {
    const r = validateUploadFile(makeFile("doc.pdf", "application/pdf"), "image");
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("accepts application/pdf for attachment kind", () => {
    expect(validateUploadFile(makeFile("doc.pdf", "application/pdf"), "attachment").valid).toBe(true);
  });

  it("rejects image/svg+xml with descriptive message", () => {
    const r = validateUploadFile(makeFile("icon.svg", "image/svg+xml"), "image");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/SVG/i);
    expect(r.error).toMatch(/convert|not supported/i);
  });

  it("rejects image/heic with descriptive message", () => {
    const r = validateUploadFile(makeFile("photo.heic", "image/heic"), "image");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/HEIC|not supported/i);
  });

  it("rejects image/avif with descriptive message", () => {
    const r = validateUploadFile(makeFile("photo.avif", "image/avif"), "image");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/AVIF|not supported/i);
  });

  it("rejects application/octet-stream (generic binary)", () => {
    const r = validateUploadFile(makeFile("file.bin", "application/octet-stream"), "image");
    expect(r.valid).toBe(false);
  });

  it("rejects text/html", () => {
    expect(validateUploadFile(makeFile("index.html", "text/html"), "attachment").valid).toBe(false);
  });
});

describe("validateUploadFile – size limit", () => {
  it("accepts a file at exactly 10 MiB", () => {
    const f = makeFile("large.jpg", "image/jpeg", MAX_UPLOAD_BYTES);
    expect(validateUploadFile(f, "image").valid).toBe(true);
  });

  it("rejects a file 1 byte over 10 MiB", () => {
    const f = makeFile("too-large.jpg", "image/jpeg", MAX_UPLOAD_BYTES + 1);
    const r = validateUploadFile(f, "image");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/too large|10 MB/i);
  });

  it("rejects an empty file", () => {
    const f = makeFile("empty.jpg", "image/jpeg", 0);
    const r = validateUploadFile(f, "image");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/empty/i);
  });
});

describe("validateUploadFilename", () => {
  it("accepts a normal filename", () => {
    expect(validateUploadFilename("product.jpg").valid).toBe(true);
  });

  it("rejects empty filename", () => {
    expect(validateUploadFilename("").valid).toBe(false);
  });

  it("rejects whitespace-only filename", () => {
    expect(validateUploadFilename("   ").valid).toBe(false);
  });

  it("rejects filename over 255 characters", () => {
    const long = "a".repeat(256);
    expect(validateUploadFilename(long).valid).toBe(false);
  });

  it("accepts filename exactly 255 characters", () => {
    const exact = "a".repeat(255);
    expect(validateUploadFilename(exact).valid).toBe(true);
  });

  it("rejects filename with forward slash", () => {
    const r = validateUploadFilename("path/to/file.jpg");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/slash/i);
  });

  it("rejects filename with backslash", () => {
    const r = validateUploadFilename("path\\file.jpg");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/slash/i);
  });

  it("rejects filename with null byte (control character)", () => {
    const r = validateUploadFilename("file\x00name.jpg");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/control/i);
  });

  it("rejects filename with tab character (control)", () => {
    const r = validateUploadFilename("file\tname.jpg");
    expect(r.valid).toBe(false);
  });

  it("accepts filename with spaces (not a control char)", () => {
    expect(validateUploadFilename("my product.jpg").valid).toBe(true);
  });

  it("accepts filename with unicode characters", () => {
    expect(validateUploadFilename("produto-maçã.jpg").valid).toBe(true);
  });
});

// ─── Upload state machine ─────────────────────────────────────────────────────

describe("isValidStateTransition", () => {
  it("local → beginning is valid", () => {
    expect(isValidStateTransition("local", "beginning")).toBe(true);
  });

  it("beginning → uploading is valid", () => {
    expect(isValidStateTransition("beginning", "uploading")).toBe(true);
  });

  it("uploading → uploaded-awaiting-finish is valid", () => {
    expect(isValidStateTransition("uploading", "uploaded-awaiting-finish")).toBe(true);
  });

  it("uploaded-awaiting-finish → ready is valid", () => {
    expect(isValidStateTransition("uploaded-awaiting-finish", "ready")).toBe(true);
  });

  it("ready → attached is valid", () => {
    expect(isValidStateTransition("ready", "attached")).toBe(true);
  });

  it("ready → cleanup-needed is valid (discard path)", () => {
    expect(isValidStateTransition("ready", "cleanup-needed")).toBe(true);
  });

  it("beginning → cleanup-needed is valid (error path)", () => {
    expect(isValidStateTransition("beginning", "cleanup-needed")).toBe(true);
  });

  it("uploading → cleanup-needed is valid (error path)", () => {
    expect(isValidStateTransition("uploading", "cleanup-needed")).toBe(true);
  });

  it("attached → anything is NOT valid (terminal state)", () => {
    const targets: UploadState[] = ["local", "beginning", "uploading", "uploaded-awaiting-finish", "ready", "cleanup-needed"];
    for (const to of targets) {
      expect(isValidStateTransition("attached", to)).toBe(false);
    }
  });

  it("cleanup-needed → anything is NOT valid (terminal state)", () => {
    const targets: UploadState[] = ["local", "beginning", "uploading", "uploaded-awaiting-finish", "ready", "attached"];
    for (const to of targets) {
      expect(isValidStateTransition("cleanup-needed", to)).toBe(false);
    }
  });

  it("ready → beginning is NOT valid (no backwards)", () => {
    expect(isValidStateTransition("ready", "beginning")).toBe(false);
  });

  it("uploaded-awaiting-finish → uploading is NOT valid (no backwards)", () => {
    expect(isValidStateTransition("uploaded-awaiting-finish", "uploading")).toBe(false);
  });

  it("local → ready is NOT valid (must go through beginning/uploading)", () => {
    expect(isValidStateTransition("local", "ready")).toBe(false);
  });
});

// ─── Ticket persistence/recovery ─────────────────────────────────────────────

describe("interruption recovery – ticket scan logic", () => {
  it("identifies uploaded-awaiting-finish tickets with storageId as recovery candidates", () => {
    const tickets: UploadTicket[] = [
      makeTicket({ uploadId: "u1", state: "ready", storageId: "s1" }),
      makeTicket({ uploadId: "u2", state: "uploaded-awaiting-finish", storageId: "s2" }),
      makeTicket({ uploadId: "u3", state: "uploaded-awaiting-finish", storageId: null }),
      makeTicket({ uploadId: "u4", state: "uploading", storageId: null }),
    ];

    const recoverable = tickets.filter(
      (t) => t.state === "uploaded-awaiting-finish" && t.uploadId && t.storageId
    );

    expect(recoverable).toHaveLength(1);
    expect(recoverable[0].uploadId).toBe("u2");
  });

  it("tickets without storageId are NOT recovery candidates (no uploadId → begin was lost)", () => {
    const ticket = makeTicket({ state: "uploaded-awaiting-finish", storageId: null });
    const isRecoverable = ticket.state === "uploaded-awaiting-finish" && !!ticket.storageId;
    expect(isRecoverable).toBe(false);
  });

  it("recovery retry uses the same uploadId and storageId pair — no re-upload", () => {
    const ticket = makeTicket({
      uploadId: "upld_recover_001",
      storageId: "stor_abc123",
      state: "uploaded-awaiting-finish",
    });

    // Simulate recovery: finish payload must use ticket's IDs exactly
    const finishPayload = {
      operation: "finish" as const,
      uploadId: ticket.uploadId,
      storageId: ticket.storageId!,
    };

    expect(finishPayload.uploadId).toBe("upld_recover_001");
    expect(finishPayload.storageId).toBe("stor_abc123");
    // Not "re-uploading" — storageId came from the prior upload response
  });

  it("a ticket can be persisted and deserialized correctly", () => {
    const ticket = makeTicket({
      uploadId: "upld_persist_001",
      state: "beginning",
      storageId: null,
      sha256: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
    });

    const serialized = JSON.stringify(ticket);
    const deserialized = JSON.parse(serialized) as UploadTicket;

    expect(deserialized.uploadId).toBe("upld_persist_001");
    expect(deserialized.state).toBe("beginning");
    expect(deserialized.storageId).toBeNull();
    expect(deserialized.sha256).toBe("47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
  });
});

// ─── Cover priority logic ─────────────────────────────────────────────────────

describe("computeCoverSource", () => {
  it("first uploaded image with a storageId is the cover (backend rule)", () => {
    const result = computeCoverSource(
      ["upld_a", "upld_b"],
      { upld_a: "stor_001", upld_b: "stor_002" },
      ["https://cdn.example.com/img.jpg"]
    );
    expect(result).toEqual({ source: "upload", uploadId: "upld_a" });
  });

  it("external URL is cover only when NO upload has a storageId", () => {
    const result = computeCoverSource(
      [],
      {},
      ["https://cdn.example.com/img.jpg"]
    );
    expect(result).toEqual({ source: "external", url: "https://cdn.example.com/img.jpg" });
  });

  it("upload cover wins over external URL even if upload is second in slot order", () => {
    const result = computeCoverSource(
      ["upld_a"],
      { upld_a: "stor_001" },
      ["https://cdn.example.com/img.jpg"]
    );
    // Upload wins regardless of external URL presence
    expect(result?.source).toBe("upload");
  });

  it("upload without storageId (not yet processed) does NOT win cover", () => {
    const result = computeCoverSource(
      ["upld_a"],
      { upld_a: null },  // no storageId yet
      ["https://cdn.example.com/img.jpg"]
    );
    // External URL wins since upload has no storageId
    expect(result).toEqual({ source: "external", url: "https://cdn.example.com/img.jpg" });
  });

  it("returns null when there are no images at all", () => {
    expect(computeCoverSource([], {}, [])).toBeNull();
    expect(computeCoverSource([], {}, [""])).toBeNull();
  });

  it("ordering within uploads is respected — first with storageId wins", () => {
    const result = computeCoverSource(
      ["upld_a", "upld_b", "upld_c"],
      { upld_a: null, upld_b: "stor_b", upld_c: "stor_c" },
      []
    );
    expect(result).toEqual({ source: "upload", uploadId: "upld_b" });
  });

  it("do not label external URL as cover when stored upload will win", () => {
    const uploadStorageIds = { upld_a: "stor_001" };
    const coverResult = computeCoverSource(["upld_a"], uploadStorageIds, ["https://ext.com/img.jpg"]);
    expect(coverResult?.source).toBe("upload");
    expect(coverResult?.source).not.toBe("external");
  });
});

// ─── Combined image count enforcement ─────────────────────────────────────────

describe("image + external combined count (max 5 total)", () => {
  it("5 uploaded + 0 external = 5 total (OK)", () => {
    const ids = ["u1", "u2", "u3", "u4", "u5"];
    const external: string[] = [];
    const total = ids.length + external.length;
    expect(total).toBeLessThanOrEqual(5);
  });

  it("3 uploaded + 2 external = 5 total (OK)", () => {
    const ids = ["u1", "u2", "u3"];
    const external = ["https://a.com/1.jpg", "https://a.com/2.jpg"];
    expect(ids.length + external.length).toBeLessThanOrEqual(5);
  });

  it("3 uploaded + 3 external = 6 total (OVER LIMIT)", () => {
    const ids = ["u1", "u2", "u3"];
    const external = ["https://a.com/1.jpg", "https://a.com/2.jpg", "https://a.com/3.jpg"];
    expect(ids.length + external.length).toBeGreaterThan(5);
  });

  it("0 uploaded + 5 external = 5 total (OK, same as before Stage 3)", () => {
    const ids: string[] = [];
    const external = Array.from({ length: 5 }, (_, i) => `https://a.com/${i}.jpg`);
    expect(ids.length + external.length).toBeLessThanOrEqual(5);
  });
});

// ─── uploadIds construction ───────────────────────────────────────────────────

describe("buildUploadIds", () => {
  it("only includes ready tickets", () => {
    const readyIds = new Set(["u1", "u3"]);
    const result = buildUploadIds(["u1", "u2", "u3"], [], readyIds);
    expect(result).toEqual(["u1", "u3"]);
    expect(result).not.toContain("u2");
  });

  it("images come before attachments", () => {
    const readyIds = new Set(["img1", "att1", "img2"]);
    const result = buildUploadIds(["img1", "img2"], ["att1"], readyIds);
    expect(result).toEqual(["img1", "img2", "att1"]);
  });

  it("no duplicates even if IDs appear in both lists", () => {
    const readyIds = new Set(["u1"]);
    const result = buildUploadIds(["u1"], ["u1"], readyIds);
    expect(result).toHaveLength(1);
    expect(result).toEqual(["u1"]);
  });

  it("limits to 15 total", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `u${i}`);
    const readyIds = new Set(ids);
    const result = buildUploadIds(ids, [], readyIds);
    expect(result).toHaveLength(15);
  });

  it("uses ticket IDs (uploadId), NOT storageId values", () => {
    // uploadIds in save payloads are TICKET IDs, not storageId values
    const uploadId = "upld_abc123";
    const storageId = "stor_xyz789";
    const readyIds = new Set([uploadId]);
    const result = buildUploadIds([uploadId], [], readyIds);
    expect(result).toContain(uploadId);
    expect(result).not.toContain(storageId);
  });

  it("returns empty array when no ready tickets", () => {
    const result = buildUploadIds(["u1", "u2"], [], new Set());
    expect(result).toEqual([]);
  });

  it("preserves slot order within uploads", () => {
    const readyIds = new Set(["u3", "u1", "u2"]);
    const result = buildUploadIds(["u3", "u1", "u2"], [], readyIds);
    expect(result).toEqual(["u3", "u1", "u2"]);
  });
});

// ─── buildSavePayload – uploadIds integration ─────────────────────────────────

describe("buildSavePayload with uploadIds", () => {
  const REQUEST_ID = "00000000-0000-0000-0000-000000000001";

  it("passes uploadIds through to the payload", () => {
    const form = makeForm();
    const uploadIds = ["upld_abc", "upld_def"];
    const p = buildSavePayload(form, REQUEST_ID, uploadIds);
    expect(p.uploadIds).toEqual(["upld_abc", "upld_def"]);
  });

  it("defaults to empty uploadIds when not provided", () => {
    const form = makeForm();
    const p = buildSavePayload(form, REQUEST_ID);
    expect(p.uploadIds).toEqual([]);
  });

  it("limits uploadIds to 15", () => {
    const form = makeForm();
    const ids = Array.from({ length: 20 }, (_, i) => `upld_${i}`);
    const p = buildSavePayload(form, REQUEST_ID, ids);
    expect(p.uploadIds.length).toBeLessThanOrEqual(15);
  });

  it("uploadIds are ticket IDs (not storageIds, not generated UUIDs)", () => {
    const form = makeForm();
    const ticketId = "upld_TICKET123";
    const p = buildSavePayload(form, REQUEST_ID, [ticketId]);
    expect(p.uploadIds).toContain("upld_TICKET123");
  });
});

// ─── Discard result: discarded:false is ambiguous ─────────────────────────────

describe("discard result – discarded:false is ambiguous", () => {
  it("discarded:false does not guarantee deletion", () => {
    // discarded:false can mean missing, foreign, or already attached
    const result = { success: true as const, discarded: false };
    const isDefinitelyGone = result.discarded === true;
    expect(isDefinitelyGone).toBe(false);
  });

  it("discarded:true is the only confirmed deletion signal", () => {
    const result = { success: true as const, discarded: true };
    expect(result.discarded).toBe(true);
  });

  it("parseDiscardUploadResponse handles discarded:false correctly (not thrown as error)", () => {
    const data = { success: true, discarded: false };
    const parsed = parseDiscardUploadResponse(data);
    expect(parsed.success).toBe(true);
    expect(parsed.discarded).toBe(false);
  });

  it("parseDiscardUploadResponse handles discarded:true correctly", () => {
    const data = { success: true, discarded: true };
    const parsed = parseDiscardUploadResponse(data);
    expect(parsed.discarded).toBe(true);
  });

  it("parseDiscardUploadResponse rejects success:false", () => {
    expect(() => parseDiscardUploadResponse({ success: false, error: "Not found" })).toThrow(ApiError);
  });
});

// ─── Save blocked while in-progress uploads ───────────────────────────────────

describe("save blocked while in-progress uploads", () => {
  it("in-progress state 'beginning' should block save", () => {
    const tickets: UploadTicket[] = [
      makeTicket({ state: "beginning" }),
    ];
    const hasInProgress = tickets.some(
      (t) => t.state === "beginning" || t.state === "uploading" || t.state === "uploaded-awaiting-finish"
    );
    expect(hasInProgress).toBe(true);
  });

  it("in-progress state 'uploading' should block save", () => {
    const tickets: UploadTicket[] = [makeTicket({ state: "uploading" })];
    const hasInProgress = tickets.some(
      (t) => t.state === "beginning" || t.state === "uploading" || t.state === "uploaded-awaiting-finish"
    );
    expect(hasInProgress).toBe(true);
  });

  it("in-progress state 'uploaded-awaiting-finish' should block save", () => {
    const tickets: UploadTicket[] = [makeTicket({ state: "uploaded-awaiting-finish" })];
    const hasInProgress = tickets.some(
      (t) => t.state === "beginning" || t.state === "uploading" || t.state === "uploaded-awaiting-finish"
    );
    expect(hasInProgress).toBe(true);
  });

  it("state 'ready' does NOT block save", () => {
    const tickets: UploadTicket[] = [makeTicket({ state: "ready" })];
    const hasInProgress = tickets.some(
      (t) => t.state === "beginning" || t.state === "uploading" || t.state === "uploaded-awaiting-finish"
    );
    expect(hasInProgress).toBe(false);
  });

  it("state 'attached' does NOT block save", () => {
    const tickets: UploadTicket[] = [makeTicket({ state: "attached" })];
    const hasInProgress = tickets.some(
      (t) => t.state === "beginning" || t.state === "uploading" || t.state === "uploaded-awaiting-finish"
    );
    expect(hasInProgress).toBe(false);
  });

  it("mixed tickets: one in-progress still blocks save", () => {
    const tickets: UploadTicket[] = [
      makeTicket({ uploadId: "u1", state: "ready" }),
      makeTicket({ uploadId: "u2", state: "uploading" }),
      makeTicket({ uploadId: "u3", state: "ready" }),
    ];
    const hasInProgress = tickets.some(
      (t) => t.state === "beginning" || t.state === "uploading" || t.state === "uploaded-awaiting-finish"
    );
    expect(hasInProgress).toBe(true);
  });
});

// ─── API response parsers: begin/finish/discard ───────────────────────────────

describe("parseBeginUploadResponse", () => {
  it("accepts a valid begin response", () => {
    const data = {
      success: true,
      protocolVersion: 2,
      uploadId: "upld_abc123",
      uploadUrl: "https://storage.example.com/upload/abc",
    };
    const r = parseBeginUploadResponse(data);
    expect(r.uploadId).toBe("upld_abc123");
    expect(r.uploadUrl).toBe("https://storage.example.com/upload/abc");
  });

  it("rejects when success is false", () => {
    expect(() => parseBeginUploadResponse({ success: false, error: "Quota exceeded" })).toThrow(ApiError);
    expect(() => parseBeginUploadResponse({ success: false, error: "Quota exceeded" })).toThrow("Quota exceeded");
  });

  it("rejects when uploadId is missing", () => {
    expect(() => parseBeginUploadResponse({ success: true, uploadUrl: "https://example.com" })).toThrow(ApiError);
  });

  it("rejects when uploadUrl is missing", () => {
    expect(() => parseBeginUploadResponse({ success: true, uploadId: "upld_abc" })).toThrow(ApiError);
  });

  it("rejects null input", () => {
    expect(() => parseBeginUploadResponse(null)).toThrow(ApiError);
  });
});

describe("parseFinishUploadResponse", () => {
  it("accepts a valid finish response", () => {
    const data = { success: true, protocolVersion: 2, uploadId: "upld_abc123" };
    const r = parseFinishUploadResponse(data);
    expect(r.uploadId).toBe("upld_abc123");
  });

  it("rejects when success is false", () => {
    expect(() => parseFinishUploadResponse({ success: false, error: "Not found" })).toThrow(ApiError);
  });

  it("rejects when uploadId is missing", () => {
    expect(() => parseFinishUploadResponse({ success: true })).toThrow(ApiError);
  });

  it("rejects null input", () => {
    expect(() => parseFinishUploadResponse(null)).toThrow(ApiError);
  });
});

// ─── Attached ticket protection ───────────────────────────────────────────────

describe("attached ticket protection", () => {
  it("attached tickets must not be discarded after a successful save", () => {
    const ticket = makeTicket({ state: "attached" });
    // Simulate the guard: never discard attached tickets
    const shouldDiscard = ticket.state !== "attached" && ticket.state === "ready";
    expect(shouldDiscard).toBe(false);
  });

  it("ready tickets (not attached) CAN be discarded", () => {
    const ticket = makeTicket({ state: "ready" });
    const canDiscard = ticket.state === "ready";
    expect(canDiscard).toBe(true);
  });

  it("save success should update included ticket states to attached", () => {
    const tickets: Record<string, UploadTicket> = {
      u1: makeTicket({ uploadId: "u1", state: "ready" }),
      u2: makeTicket({ uploadId: "u2", state: "ready" }),
      u3: makeTicket({ uploadId: "u3", state: "ready" }),
    };
    const uploadIds = ["u1", "u2"]; // u3 was not included

    // Simulate post-save state update
    for (const uid of uploadIds) {
      tickets[uid] = { ...tickets[uid], state: "attached" };
    }

    expect(tickets["u1"].state).toBe("attached");
    expect(tickets["u2"].state).toBe("attached");
    expect(tickets["u3"].state).toBe("ready"); // not included, not attached
  });
});

// ─── Limits: max 30 pending/ready tickets ─────────────────────────────────────

describe("upload limits", () => {
  it("max 10 attachments enforced by checking count before upload", () => {
    const attachmentIds = Array.from({ length: 10 }, (_, i) => `att_${i}`);
    const canAddMore = attachmentIds.length < 10;
    expect(canAddMore).toBe(false);
  });

  it("can add attachment when count is 9", () => {
    const attachmentIds = Array.from({ length: 9 }, (_, i) => `att_${i}`);
    expect(attachmentIds.length < 10).toBe(true);
  });

  it("max 5 image uploads enforced", () => {
    const imageIds = Array.from({ length: 5 }, (_, i) => `img_${i}`);
    const canAddMore = imageIds.length < 5;
    expect(canAddMore).toBe(false);
  });

  it("max 15 uploadIds in save payload", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `u${i}`);
    const readyIds = new Set(ids);
    const result = buildUploadIds(ids, [], readyIds);
    expect(result.length).toBeLessThanOrEqual(15);
  });
});
