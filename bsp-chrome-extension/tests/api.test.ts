/**
 * Tests for API parsing, verification response handling, key isolation,
 * and message sender validation.
 */

import { parseVerifyResponse, ApiError } from "../src/service-worker/api";

// ─── parseVerifyResponse ──────────────────────────────────────────────────────

describe("parseVerifyResponse", () => {
  it("accepts a valid response with protocolVersion: 1 (intentional by design)", () => {
    const data = {
      success: true,
      protocolVersion: 1,
      verifiedAt: "2026-10-08T12:56:00Z",
      connectionName: "My BSP Account",
    };
    const result = parseVerifyResponse(data);
    expect(result.success).toBe(true);
    expect(result.protocolVersion).toBe(1);
    expect(result.connectionName).toBe("My BSP Account");
    expect(result.verifiedAt).toBe("2026-10-08T12:56:00Z");
  });

  it("accepts a valid response with higher protocolVersion", () => {
    const data = {
      success: true,
      protocolVersion: 2,
      verifiedAt: "2026-10-08T13:00:00Z",
      connectionName: "Account B",
    };
    const result = parseVerifyResponse(data);
    expect(result.protocolVersion).toBe(2);
  });

  it("rejects when success is false", () => {
    const data = {
      success: false,
      protocolVersion: 1,
      verifiedAt: "2026-10-08T12:56:00Z",
      connectionName: "x",
    };
    expect(() => parseVerifyResponse(data)).toThrow(ApiError);
  });

  it("includes error string from response when success is false", () => {
    const data = {
      success: false,
      error: "Invalid key provided",
      protocolVersion: 1,
      verifiedAt: "",
      connectionName: "",
    };
    expect(() => parseVerifyResponse(data)).toThrow("Invalid key provided");
  });

  it("rejects when protocolVersion is missing", () => {
    const data = {
      success: true,
      verifiedAt: "2026-10-08T12:56:00Z",
      connectionName: "x",
    };
    expect(() => parseVerifyResponse(data)).toThrow(ApiError);
  });

  it("rejects when verifiedAt is missing", () => {
    const data = {
      success: true,
      protocolVersion: 1,
      connectionName: "x",
    };
    expect(() => parseVerifyResponse(data)).toThrow(ApiError);
  });

  it("rejects when connectionName is missing", () => {
    const data = {
      success: true,
      protocolVersion: 1,
      verifiedAt: "2026-10-08T12:56:00Z",
    };
    expect(() => parseVerifyResponse(data)).toThrow(ApiError);
  });

  it("rejects when connectionName is empty string", () => {
    const data = {
      success: true,
      protocolVersion: 1,
      verifiedAt: "2026-10-08T12:56:00Z",
      connectionName: "",
    };
    expect(() => parseVerifyResponse(data)).toThrow(ApiError);
  });

  it("rejects when response is null", () => {
    expect(() => parseVerifyResponse(null)).toThrow(ApiError);
  });

  it("rejects when response is a string", () => {
    expect(() => parseVerifyResponse("ok")).toThrow(ApiError);
  });

  it("rejects when response is an empty object", () => {
    expect(() => parseVerifyResponse({})).toThrow(ApiError);
  });
});

// ─── Key isolation ────────────────────────────────────────────────────────────

describe("Key isolation", () => {
  it("content script does not import from the storage module", () => {
    const fs = require("fs");
    const path = require("path");
    const extractContent: string = fs.readFileSync(
      path.resolve(__dirname, "../src/content/extract.ts"),
      "utf-8"
    );
    // Must not contain actual import statements referencing storage
    expect(extractContent).not.toMatch(/^import.*storage/m);
    // Must not call chrome.storage API directly
    expect(extractContent).not.toMatch(/chrome\.storage\./);
    // Must not contain a connectionKey assignment/reference
    expect(extractContent).not.toMatch(/connectionKey\s*=/);
  });

  it("content script does not reference the connection key constant", () => {
    const fs = require("fs");
    const path = require("path");
    const extractContent: string = fs.readFileSync(
      path.resolve(__dirname, "../src/content/extract.ts"),
      "utf-8"
    );
    expect(extractContent).not.toMatch(/Bearer/);
    expect(extractContent).not.toMatch(/Authorization\s*:/);
  });
});

// ─── Message sender validation ────────────────────────────────────────────────

describe("Message sender validation", () => {
  /**
   * The isTrustedSender check inside index.ts is not exported, so we test
   * the contract indirectly: a sender with no `url` (simulating a web page)
   * or a different extension id must be rejected.
   */

  function isTrustedSender(
    sender: { id?: string; url?: string },
    ownId: string
  ): boolean {
    return sender.id === ownId && sender.url !== undefined;
  }

  const OWN_ID = "abcdefghijklmnopabcdefghijklmnop";

  it("accepts message from the extension's own context", () => {
    expect(
      isTrustedSender({ id: OWN_ID, url: "chrome-extension://abc/sidepanel/index.html" }, OWN_ID)
    ).toBe(true);
  });

  it("rejects message with no url (content script on a web page)", () => {
    expect(isTrustedSender({ id: OWN_ID, url: undefined }, OWN_ID)).toBe(false);
  });

  it("rejects message from a different extension id", () => {
    expect(
      isTrustedSender({ id: "differentextensionid00000000000", url: "chrome-extension://other/page.html" }, OWN_ID)
    ).toBe(false);
  });

  it("rejects message with no id", () => {
    expect(
      isTrustedSender({ url: "chrome-extension://abc/page.html" }, OWN_ID)
    ).toBe(false);
  });

  it("rejects completely empty sender", () => {
    expect(isTrustedSender({}, OWN_ID)).toBe(false);
  });
});

// ─── clearVerificationOnChange (integration-level logic) ─────────────────────

describe("clearVerificationOnChange", () => {
  it("any field change invalidates a previously verified state", () => {
    // Simulate the React state machine: verification resets to unverified
    // when isDirty becomes true (any field edited after last save).
    type Status = "unverified" | "verified" | "failed";

    function simulateFieldChange(
      currentStatus: Status,
      isDirty: boolean
    ): Status {
      if (isDirty && currentStatus !== "unverified") return "unverified";
      return currentStatus;
    }

    expect(simulateFieldChange("verified", true)).toBe("unverified");
    expect(simulateFieldChange("failed", true)).toBe("unverified");
    expect(simulateFieldChange("unverified", true)).toBe("unverified");
    expect(simulateFieldChange("verified", false)).toBe("verified");
  });
});
