/**
 * API module – runs ONLY in the service worker (trusted context).
 * Performs the actual network call to the BSP verification endpoint.
 * The connection key never leaves this module unmasked.
 */

import type { BspSettings, VerifyApiResponse } from "../types/index.js";

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
    // Network-level error – do NOT include key in message
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
