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
