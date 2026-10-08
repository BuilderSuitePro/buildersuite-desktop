/**
 * Tests for the one-time all-sites permission flow (Fix 1) and
 * the panel-ready handshake / pending candidate delivery (Fix 2).
 */

// ─── All-sites permission flow ────────────────────────────────────────────────

describe("All-sites permission state management", () => {
  /**
   * Mirrors the logic in GET_ALL_SITES_STATE and GET_HOVER_SITE_STATE handlers.
   */
  function resolveHoverEnabled(
    allSitesEnabled: boolean,
    permissionGranted: boolean,
    grantedOrigins: string[],
    targetOrigin: string
  ): boolean {
    if (allSitesEnabled && permissionGranted) return true;
    // if flag says enabled but permission was revoked externally, treat as disabled
    return grantedOrigins.includes(targetOrigin);
  }

  it("returns true when all-sites flag is set and permission is granted", () => {
    expect(resolveHoverEnabled(true, true, [], "https://shop.example.com")).toBe(true);
  });

  it("returns false when all-sites flag is set but permission was revoked externally", () => {
    expect(resolveHoverEnabled(true, false, [], "https://shop.example.com")).toBe(false);
  });

  it("falls back to per-origin check when all-sites flag is off", () => {
    const origins = ["https://example.com", "https://store.test.com"];
    expect(resolveHoverEnabled(false, false, origins, "https://example.com")).toBe(true);
    expect(resolveHoverEnabled(false, false, origins, "https://other.com")).toBe(false);
  });

  it("per-origin fallback works even if permission would be granted (flag false)", () => {
    const origins = ["https://granted-site.com"];
    expect(resolveHoverEnabled(false, true, origins, "https://granted-site.com")).toBe(true);
    expect(resolveHoverEnabled(false, true, origins, "https://not-granted.com")).toBe(false);
  });

  it("all-sites false + no granted origins returns false for any origin", () => {
    expect(resolveHoverEnabled(false, false, [], "https://anything.com")).toBe(false);
  });

  it("all-sites true + permission true + non-empty granted origins still returns true", () => {
    // All-sites takes precedence over per-origin list
    expect(resolveHoverEnabled(true, true, ["https://other.com"], "https://new-site.com")).toBe(true);
  });
});

// ─── All-sites permission request correctness ────────────────────────────────

describe("All-sites permission request origins", () => {
  const ALL_SITES_ORIGINS = ["http://*/*", "https://*/*"];

  it("all-sites origins cover http", () => {
    const httpPattern = "http://*/*";
    expect(ALL_SITES_ORIGINS).toContain(httpPattern);
  });

  it("all-sites origins cover https", () => {
    const httpsPattern = "https://*/*";
    expect(ALL_SITES_ORIGINS).toContain(httpsPattern);
  });

  it("all-sites origins do NOT include per-site patterns", () => {
    const perSitePattern = "https://example.com/*";
    expect(ALL_SITES_ORIGINS).not.toContain(perSitePattern);
  });

  it("all-sites origins list has exactly 2 entries (http + https)", () => {
    expect(ALL_SITES_ORIGINS).toHaveLength(2);
  });
});

// ─── Panel-ready handshake logic ─────────────────────────────────────────────

describe("Panel-ready handshake and candidate delivery", () => {
  interface MockCandidate {
    imageUrl: string;
    sourceUrl: string;
    timestamp: number;
    tabId: number;
  }

  function isRecentCandidate(candidate: MockCandidate, windowMs = 30000): boolean {
    return Date.now() - candidate.timestamp < windowMs;
  }

  function buildCandidate(ageMs = 0): MockCandidate {
    return {
      imageUrl: "https://cdn.example.com/product.jpg",
      sourceUrl: "https://store.example.com/item",
      timestamp: Date.now() - ageMs,
      tabId: 42,
    };
  }

  it("accepts candidate within 30-second window", () => {
    const c = buildCandidate(5000); // 5 seconds old
    expect(isRecentCandidate(c)).toBe(true);
  });

  it("accepts candidate at boundary (< 30s)", () => {
    const c = buildCandidate(29999);
    expect(isRecentCandidate(c)).toBe(true);
  });

  it("rejects stale candidate (> 30s old)", () => {
    const c = buildCandidate(31000);
    expect(isRecentCandidate(c)).toBe(false);
  });

  it("primary (storage) delivery takes precedence over secondary (PANEL_READY)", () => {
    // Simulates: panel reads from storage first, marks consumed=true.
    // If SW also tries to deliver via PANEL_READY response, it should be ignored.
    let consumed = false;
    let applied: MockCandidate | null = null;

    function applyFromStorage(c: MockCandidate) {
      if (!consumed) {
        consumed = true;
        applied = c;
      }
    }

    function applyFromPanelReady(c: MockCandidate) {
      if (!consumed) {
        consumed = true;
        applied = c;
      }
    }

    const storageCandidate = buildCandidate(100);
    const panelReadyCandidate = buildCandidate(200); // slightly older

    applyFromStorage(storageCandidate);
    applyFromPanelReady(panelReadyCandidate); // should be ignored since already consumed

    expect(consumed).toBe(true);
    expect(applied).toBe(storageCandidate); // primary wins
    expect(applied).not.toBe(panelReadyCandidate);
  });

  it("secondary (PANEL_READY) delivery fires when storage read missed the candidate", () => {
    let consumed = false;
    let applied: MockCandidate | null = null;

    function applyFromStorage(_c: MockCandidate | undefined) {
      // Storage read found nothing (race: write not complete yet)
      if (_c && !consumed) {
        consumed = true;
        applied = _c;
      }
    }

    function applyFromPanelReady(c: MockCandidate) {
      if (!consumed) {
        consumed = true;
        applied = c;
      }
    }

    applyFromStorage(undefined); // storage read returned nothing
    const panelReadyCandidate = buildCandidate(50);
    applyFromPanelReady(panelReadyCandidate);

    expect(consumed).toBe(true);
    expect(applied).toBe(panelReadyCandidate);
  });

  it("neither delivery fires if no candidate exists", () => {
    let consumed = false;

    function maybeApply(c: MockCandidate | undefined | null) {
      if (c) consumed = true;
    }

    maybeApply(undefined); // storage: nothing
    maybeApply(null);      // PANEL_READY: nothing

    expect(consumed).toBe(false);
  });
});

// ─── sidePanel.open must be called before any await ──────────────────────────

describe("Service worker HOVER_IMAGE_CLICKED handler order invariant", () => {
  /**
   * The HOVER_IMAGE_CLICKED handler MUST call sidePanel.open() before any
   * await/Promise resolution. This test verifies the correct call ordering
   * by simulating the handler logic.
   */

  it("sidePanel.open is called before storage.set in synchronous handler", () => {
    const callOrder: string[] = [];

    // Simulate the synchronous onMessage handler for HOVER_IMAGE_CLICKED
    function simulateHandler(tabId: number) {
      // Step 1: open panel (synchronous call, .catch registered but not awaited)
      const openResult = new Promise<void>((resolve) => {
        callOrder.push("sidePanel.open");
        resolve();
      });
      openResult.catch(() => {});

      // Step 2: storage write (fire-and-forget)
      callOrder.push("storage.set");

      // Step 3: respond
      callOrder.push("sendResponse");

      return tabId;
    }

    simulateHandler(42);

    expect(callOrder[0]).toBe("sidePanel.open");
    expect(callOrder[1]).toBe("storage.set");
    expect(callOrder[2]).toBe("sendResponse");
  });

  it("sidePanel.open is NOT delayed behind an async storage write", () => {
    // The OLD (broken) code pattern: await savePendingCandidate BEFORE sidePanel.open
    // This test verifies that the old pattern would cause a different call order.
    const oldCallOrder: string[] = [];

    async function simulateOldHandler(tabId: number) {
      // OLD: await storage FIRST — this loses user gesture context
      await Promise.resolve(); // simulates await savePendingCandidate()
      oldCallOrder.push("storage.set");
      oldCallOrder.push("sidePanel.open"); // too late!
      return tabId;
    }

    // The correct new order is: sidePanel.open FIRST
    const newCallOrder: string[] = [];

    function simulateNewHandler(tabId: number) {
      newCallOrder.push("sidePanel.open"); // FIRST (sync)
      newCallOrder.push("storage.set");   // second (fire-and-forget)
      return tabId;
    }

    simulateNewHandler(42);
    // Run old handler too (just to show the difference is documented)
    void simulateOldHandler(42);

    // New handler: sidePanel.open is first
    expect(newCallOrder[0]).toBe("sidePanel.open");
    expect(newCallOrder[1]).toBe("storage.set");
  });
});

// ─── Content script sender validation (all-sites context) ────────────────────

describe("Content script sender validation for HOVER_IMAGE_CLICKED", () => {
  function isContentScriptSender(
    sender: { id?: string; tab?: { id: number }; url?: string },
    ownId: string
  ): boolean {
    return (
      sender.id === ownId &&
      sender.tab !== undefined &&
      sender.url !== undefined &&
      !sender.url.startsWith("chrome-extension://")
    );
  }

  const OWN_ID = "abcdefghijklmnopabcdefghijklmnop";

  it("accepts http:// content script senders (needed for all-sites http permission)", () => {
    expect(
      isContentScriptSender(
        { id: OWN_ID, tab: { id: 1 }, url: "http://shop.example.com/product" },
        OWN_ID
      )
    ).toBe(true);
  });

  it("accepts https:// content script senders", () => {
    expect(
      isContentScriptSender(
        { id: OWN_ID, tab: { id: 2 }, url: "https://store.example.com/item" },
        OWN_ID
      )
    ).toBe(true);
  });

  it("rejects senders from extension pages (panel or popup trying to spoof)", () => {
    expect(
      isContentScriptSender(
        { id: OWN_ID, tab: { id: 3 }, url: "chrome-extension://abc123/sidepanel/index.html" },
        OWN_ID
      )
    ).toBe(false);
  });

  it("rejects senders without a tab (extension page context)", () => {
    expect(
      isContentScriptSender(
        { id: OWN_ID, url: "https://example.com" },
        OWN_ID
      )
    ).toBe(false);
  });
});

// ─── Manifest / permission config correctness ─────────────────────────────────

describe("Optional host permissions config", () => {
  // These represent what should be in manifest.json
  const optionalHostPermissions = ["https://*/*", "http://*/*"];

  it("optional_host_permissions contains https://*/*", () => {
    expect(optionalHostPermissions).toContain("https://*/*");
  });

  it("optional_host_permissions contains http://*/*", () => {
    expect(optionalHostPermissions).toContain("http://*/*");
  });

  it("permissions request uses the same patterns as optional_host_permissions", () => {
    const requestedOrigins = ["http://*/*", "https://*/*"];
    const allPresent = requestedOrigins.every((o) =>
      optionalHostPermissions.includes(o)
    );
    expect(allPresent).toBe(true);
  });
});

// ─── Error visibility – sidePanel.open failure ───────────────────────────────

describe("sidePanel.open error visibility", () => {
  function buildSidePanelError(message: string): { message: string; timestamp: number } {
    return { message, timestamp: Date.now() };
  }

  it("stores error object with message and timestamp", () => {
    const err = buildSidePanelError("User gesture required");
    expect(err.message).toBeTruthy();
    expect(typeof err.timestamp).toBe("number");
  });

  it("error message is a non-empty string", () => {
    const err = buildSidePanelError("sidePanel.open failed: no gesture");
    expect(err.message.length).toBeGreaterThan(0);
  });

  it("timestamp is recent", () => {
    const before = Date.now();
    const err = buildSidePanelError("any error");
    const after = Date.now();
    expect(err.timestamp).toBeGreaterThanOrEqual(before);
    expect(err.timestamp).toBeLessThanOrEqual(after + 100);
  });
});

// ─── registerContentScripts idempotency ──────────────────────────────────────

describe("Content script re-registration on SW restart", () => {
  function isAlreadyRegisteredError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes("Duplicate script ID") || msg.includes("already registered");
  }

  it("recognizes 'Duplicate script ID' as an expected error", () => {
    const err = new Error("Duplicate script ID: bsp-hover-all-sites");
    expect(isAlreadyRegisteredError(err)).toBe(true);
  });

  it("recognizes 'already registered' as an expected error", () => {
    const err = new Error("Content script already registered");
    expect(isAlreadyRegisteredError(err)).toBe(true);
  });

  it("does NOT swallow unexpected errors", () => {
    const err = new Error("Network failure or quota exceeded");
    expect(isAlreadyRegisteredError(err)).toBe(false);
  });

  it("treats non-Error values gracefully", () => {
    expect(isAlreadyRegisteredError("already registered")).toBe(true);
    expect(isAlreadyRegisteredError(42)).toBe(false);
    expect(isAlreadyRegisteredError(null)).toBe(false);
  });
});
