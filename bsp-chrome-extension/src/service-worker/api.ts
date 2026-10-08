/**
 * API module – runs ONLY in the service worker (trusted context).
 * Performs network calls to BSP endpoints.
 * The connection key never leaves this module unmasked.
 */

import type {
  BspSettings,
  VerifyApiResponse,
  ProductSavePayload,
  SaveApiResponse,
  UploadKind,
  BspProject,
  BspBoard,
  BspSelection,
  DiscoveryPage,
} from "../types/index.js";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function parseVerifyResponse(data: unknown): VerifyApiResponse {
  if (typeof data !== "object" || data === null) {
    throw new ApiError("Invalid response: expected JSON object");
  }

  const obj = data as Record<string, unknown>;

  if (obj["success"] !== true) {
    throw new ApiError(
      typeof obj["error"] === "string"
        ? obj["error"]
        : "Verification failed: server returned success=false"
    );
  }

  if (typeof obj["protocolVersion"] !== "number") {
    throw new ApiError("Invalid response: missing protocolVersion");
  }

  if (typeof obj["verifiedAt"] !== "string" || !obj["verifiedAt"]) {
    throw new ApiError("Invalid response: missing verifiedAt");
  }

  if (typeof obj["connectionName"] !== "string" || !obj["connectionName"]) {
    throw new ApiError("Invalid response: missing connectionName");
  }

  // protocolVersion: 1 is correct and intentional – do not reject it.
  return {
    success: true,
    protocolVersion: obj["protocolVersion"] as number,
    verifiedAt: obj["verifiedAt"] as string,
    connectionName: obj["connectionName"] as string,
  };
}

export async function verifyConnection(
  settings: BspSettings
): Promise<VerifyApiResponse> {
  let response: Response;

  try {
    response = await fetch(settings.verificationUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.connectionKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      credentials: "omit",
      redirect: "error",
    });
  } catch (err) {
    const message =
      err instanceof TypeError ? err.message : "Network request failed";
    throw new ApiError(`Network error: ${message}`);
  }

  if (!response.ok) {
    throw new ApiError(
      `Server returned ${response.status} ${response.statusText}`,
      response.status
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("Invalid response: could not parse JSON");
  }

  return parseVerifyResponse(body);
}

// ─── Save Product ─────────────────────────────────────────────────────────────

export function parseSaveResponse(data: unknown): SaveApiResponse {
  if (typeof data !== "object" || data === null) {
    throw new ApiError("Invalid response: expected JSON object");
  }
  const obj = data as Record<string, unknown>;

  if (obj["success"] !== true) {
    throw new ApiError(
      typeof obj["error"] === "string"
        ? obj["error"]
        : "Save failed: server returned success=false"
    );
  }
  if (typeof obj["protocolVersion"] !== "number") {
    throw new ApiError("Invalid response: missing protocolVersion");
  }
  if (typeof obj["materialId"] !== "string" || !obj["materialId"]) {
    throw new ApiError("Invalid response: missing materialId");
  }
  if (typeof obj["path"] !== "string" || !obj["path"]) {
    throw new ApiError("Invalid response: missing path");
  }

  return {
    success: true,
    protocolVersion: obj["protocolVersion"] as number,
    materialId: obj["materialId"] as string,
    path: obj["path"] as string,
    replayed: obj["replayed"] === true,
    selectionId:
      typeof obj["selectionId"] === "string" ? obj["selectionId"] : undefined,
    selectionPath:
      typeof obj["selectionPath"] === "string"
        ? obj["selectionPath"]
        : undefined,
  };
}

const MAX_REQUEST_BYTES = 131072;
const MAX_PRODUCT_CHARS = 100000;

export async function saveProduct(
  settings: BspSettings,
  payload: ProductSavePayload
): Promise<SaveApiResponse> {
  const bodyStr = JSON.stringify(payload);

  // Size guards before sending
  if (bodyStr.length > MAX_PRODUCT_CHARS) {
    throw new ApiError(
      "Product payload too large (exceeds 100000 chars). Reduce description or notes.",
      413
    );
  }

  const byteLength = new TextEncoder().encode(bodyStr).length;
  if (byteLength > MAX_REQUEST_BYTES) {
    throw new ApiError(
      "Request too large (exceeds 131072 bytes). Reduce description or notes.",
      413
    );
  }

  let response: Response;
  try {
    response = await fetch(settings.productUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.connectionKey}`,
        "Content-Type": "application/json",
      },
      body: bodyStr,
      credentials: "omit",
      redirect: "error",
    });
  } catch (err) {
    const message =
      err instanceof TypeError ? err.message : "Network request failed";
    throw new ApiError(`Network error: ${message}`);
  }

  if (!response.ok) {
    let errorMsg = `Server returned ${response.status}`;
    try {
      const errBody = await response.json() as Record<string, unknown>;
      if (typeof errBody["error"] === "string") {
        errorMsg = errBody["error"];
      } else if (typeof errBody["message"] === "string") {
        errorMsg = errBody["message"];
      }
    } catch {
      // ignore parse failure
    }
    throw new ApiError(errorMsg, response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("Invalid response: could not parse JSON");
  }

  return parseSaveResponse(body);
}

// ─── Upload: Begin ────────────────────────────────────────────────────────────

export interface BeginUploadApiPayload {
  operation: "begin";
  kind: UploadKind;
  name: string;
  sha256: string;
}

export interface BeginUploadApiResponse {
  success: true;
  protocolVersion: 2;
  uploadId: string;
  uploadUrl: string;
}

export function parseBeginUploadResponse(data: unknown): BeginUploadApiResponse {
  if (typeof data !== "object" || data === null) {
    throw new ApiError("Invalid response: expected JSON object");
  }
  const obj = data as Record<string, unknown>;

  if (obj["success"] !== true) {
    throw new ApiError(
      typeof obj["error"] === "string"
        ? obj["error"]
        : "Begin upload failed: server returned success=false"
    );
  }
  if (typeof obj["uploadId"] !== "string" || !obj["uploadId"]) {
    throw new ApiError("Invalid response: missing uploadId");
  }
  if (typeof obj["uploadUrl"] !== "string" || !obj["uploadUrl"]) {
    throw new ApiError("Invalid response: missing uploadUrl");
  }

  return {
    success: true,
    protocolVersion: 2,
    uploadId: obj["uploadId"] as string,
    uploadUrl: obj["uploadUrl"] as string,
  };
}

export async function beginUpload(
  settings: BspSettings,
  payload: BeginUploadApiPayload
): Promise<BeginUploadApiResponse> {
  let response: Response;
  try {
    response = await fetch(settings.productUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.connectionKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      credentials: "omit",
      redirect: "error",
    });
  } catch (err) {
    const message =
      err instanceof TypeError ? err.message : "Network request failed";
    throw new ApiError(`Network error: ${message}`);
  }

  if (!response.ok) {
    let errorMsg = `Server returned ${response.status}`;
    try {
      const errBody = (await response.json()) as Record<string, unknown>;
      if (typeof errBody["error"] === "string") errorMsg = errBody["error"];
      else if (typeof errBody["message"] === "string") errorMsg = errBody["message"];
    } catch {
      // ignore parse failure
    }
    throw new ApiError(errorMsg, response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("Invalid response: could not parse JSON");
  }

  return parseBeginUploadResponse(body);
}

// ─── Upload: Finish ───────────────────────────────────────────────────────────

export interface FinishUploadApiPayload {
  operation: "finish";
  uploadId: string;
  storageId: string;
}

export interface FinishUploadApiResponse {
  success: true;
  protocolVersion: 2;
  uploadId: string;
}

export function parseFinishUploadResponse(data: unknown): FinishUploadApiResponse {
  if (typeof data !== "object" || data === null) {
    throw new ApiError("Invalid response: expected JSON object");
  }
  const obj = data as Record<string, unknown>;

  if (obj["success"] !== true) {
    throw new ApiError(
      typeof obj["error"] === "string"
        ? obj["error"]
        : "Finish upload failed: server returned success=false"
    );
  }
  if (typeof obj["uploadId"] !== "string" || !obj["uploadId"]) {
    throw new ApiError("Invalid response: missing uploadId");
  }

  return {
    success: true,
    protocolVersion: 2,
    uploadId: obj["uploadId"] as string,
  };
}

export async function finishUpload(
  settings: BspSettings,
  payload: FinishUploadApiPayload
): Promise<FinishUploadApiResponse> {
  let response: Response;
  try {
    response = await fetch(settings.productUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.connectionKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      credentials: "omit",
      redirect: "error",
    });
  } catch (err) {
    const message =
      err instanceof TypeError ? err.message : "Network request failed";
    throw new ApiError(`Network error: ${message}`);
  }

  if (!response.ok) {
    let errorMsg = `Server returned ${response.status}`;
    try {
      const errBody = (await response.json()) as Record<string, unknown>;
      if (typeof errBody["error"] === "string") errorMsg = errBody["error"];
      else if (typeof errBody["message"] === "string") errorMsg = errBody["message"];
    } catch {
      // ignore parse failure
    }
    throw new ApiError(errorMsg, response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("Invalid response: could not parse JSON");
  }

  return parseFinishUploadResponse(body);
}

// ─── Upload: Discard ──────────────────────────────────────────────────────────

export interface DiscardUploadApiPayload {
  operation: "discard";
  uploadId: string;
}

export interface DiscardUploadApiResponse {
  success: true;
  /**
   * discarded: false is NOT proof of deletion — it can mean missing, foreign, or already
   * attached. Show truthful state; never claim cleanup succeeded when result is ambiguous.
   */
  discarded: boolean;
}

export function parseDiscardUploadResponse(data: unknown): DiscardUploadApiResponse {
  if (typeof data !== "object" || data === null) {
    throw new ApiError("Invalid response: expected JSON object");
  }
  const obj = data as Record<string, unknown>;

  if (obj["success"] !== true) {
    throw new ApiError(
      typeof obj["error"] === "string"
        ? obj["error"]
        : "Discard upload failed: server returned success=false"
    );
  }

  return {
    success: true,
    discarded: obj["discarded"] === true,
  };
}

export async function discardUpload(
  settings: BspSettings,
  payload: DiscardUploadApiPayload
): Promise<DiscardUploadApiResponse> {
  let response: Response;
  try {
    response = await fetch(settings.productUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.connectionKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      credentials: "omit",
      redirect: "error",
    });
  } catch (err) {
    const message =
      err instanceof TypeError ? err.message : "Network request failed";
    throw new ApiError(`Network error: ${message}`);
  }

  if (!response.ok) {
    let errorMsg = `Server returned ${response.status}`;
    try {
      const errBody = (await response.json()) as Record<string, unknown>;
      if (typeof errBody["error"] === "string") errorMsg = errBody["error"];
      else if (typeof errBody["message"] === "string") errorMsg = errBody["message"];
    } catch {
      // ignore parse failure
    }
    throw new ApiError(errorMsg, response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("Invalid response: could not parse JSON");
  }

  return parseDiscardUploadResponse(body);
}

// ─── Discovery ────────────────────────────────────────────────────────────────

function parseDiscoveryPage<T>(data: unknown, itemValidator: (item: unknown) => T): DiscoveryPage<T> {
  if (typeof data !== "object" || data === null) {
    throw new ApiError("Invalid discovery response: expected JSON object");
  }
  const obj = data as Record<string, unknown>;

  if (obj["success"] !== true) {
    throw new ApiError(
      typeof obj["error"] === "string"
        ? obj["error"]
        : "Discovery failed: server returned success=false"
    );
  }
  if (typeof obj["protocolVersion"] !== "number") {
    throw new ApiError("Invalid discovery response: missing protocolVersion");
  }
  if (!Array.isArray(obj["page"])) {
    throw new ApiError("Invalid discovery response: missing page array");
  }
  if (typeof obj["isDone"] !== "boolean") {
    throw new ApiError("Invalid discovery response: missing isDone");
  }
  if (typeof obj["continueCursor"] !== "string") {
    throw new ApiError("Invalid discovery response: missing continueCursor");
  }

  const page = (obj["page"] as unknown[]).map(itemValidator);
  return {
    success: true,
    protocolVersion: obj["protocolVersion"] as number,
    page,
    isDone: obj["isDone"] as boolean,
    continueCursor: obj["continueCursor"] as string,
  };
}

function validateProject(item: unknown): BspProject {
  if (typeof item !== "object" || item === null) {
    throw new ApiError("Invalid project item in discovery response");
  }
  const obj = item as Record<string, unknown>;
  if (typeof obj["_id"] !== "string" || !obj["_id"]) {
    throw new ApiError("Project item missing _id");
  }
  if (typeof obj["name"] !== "string") {
    throw new ApiError("Project item missing name");
  }
  return { _id: obj["_id"] as string, name: obj["name"] as string };
}

function validateBoard(item: unknown): BspBoard {
  if (typeof item !== "object" || item === null) {
    throw new ApiError("Invalid board item in discovery response");
  }
  const obj = item as Record<string, unknown>;
  if (typeof obj["_id"] !== "string" || !obj["_id"]) {
    throw new ApiError("Board item missing _id");
  }
  if (typeof obj["name"] !== "string") {
    throw new ApiError("Board item missing name");
  }
  return { _id: obj["_id"] as string, name: obj["name"] as string };
}

function validateSelection(item: unknown): BspSelection {
  if (typeof item !== "object" || item === null) {
    throw new ApiError("Invalid selection item in discovery response");
  }
  const obj = item as Record<string, unknown>;
  if (typeof obj["_id"] !== "string" || !obj["_id"]) {
    throw new ApiError("Selection item missing _id");
  }
  if (typeof obj["name"] !== "string") {
    throw new ApiError("Selection item missing name");
  }
  return {
    _id: obj["_id"] as string,
    name: obj["name"] as string,
    canReplace: obj["canReplace"] === true,
    sharedWithClient: obj["sharedWithClient"] === true,
  };
}

async function postDiscovery(
  settings: BspSettings,
  body: Record<string, unknown>
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(settings.productUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.connectionKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      credentials: "omit",
      redirect: "error",
    });
  } catch (err) {
    const message = err instanceof TypeError ? err.message : "Network request failed";
    throw new ApiError(`Network error: ${message}`);
  }

  if (!response.ok) {
    let errorMsg = `Server returned ${response.status}`;
    try {
      const errBody = (await response.json()) as Record<string, unknown>;
      if (typeof errBody["error"] === "string") errorMsg = errBody["error"];
      else if (typeof errBody["message"] === "string") errorMsg = errBody["message"];
    } catch {
      // ignore parse failure
    }
    throw new ApiError(errorMsg, response.status);
  }

  try {
    return await response.json();
  } catch {
    throw new ApiError("Invalid response: could not parse JSON");
  }
}

export async function discoverProjects(
  settings: BspSettings,
  cursor: string | null
): Promise<DiscoveryPage<BspProject>> {
  const body = await postDiscovery(settings, {
    operation: "projects",
    paginationOpts: { numItems: 25, cursor },
  });
  return parseDiscoveryPage<BspProject>(body, validateProject);
}

export async function discoverBoards(
  settings: BspSettings,
  projectId: string,
  cursor: string | null
): Promise<DiscoveryPage<BspBoard>> {
  const body = await postDiscovery(settings, {
    operation: "boards",
    projectId,
    paginationOpts: { numItems: 25, cursor },
  });
  return parseDiscoveryPage<BspBoard>(body, validateBoard);
}

export async function discoverSelections(
  settings: BspSettings,
  projectId: string,
  boardId: string,
  cursor: string | null
): Promise<DiscoveryPage<BspSelection>> {
  const body = await postDiscovery(settings, {
    operation: "selections",
    projectId,
    boardId,
    paginationOpts: { numItems: 25, cursor },
  });
  return parseDiscoveryPage<BspSelection>(body, validateSelection);
}
