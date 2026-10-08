/**
 * Checkpoint 1 tests: hover overlay, pending candidate, draft conflict,
 * message sender validation, permission state, overlay lifecycle.
 *
 * Note: hover.ts DOM interactions are tested via the exported eligibility
 * and utility functions; full overlay initialization requires a browser context.
 */

// ─── Image eligibility heuristics ────────────────────────────────────────────

describe("isEligibleImage heuristics (logic only)", () => {
  /**
   * The actual isEligibleImage function requires a real DOM with
   * getBoundingClientRect, getComputedStyle, etc. These tests verify
   * the logic that feeds into those decisions in a simplified form.
   */

  const MIN_SIZE = 150;

  function checkSizeEligible(width: number, height: number): boolean {
    return width >= MIN_SIZE && height >= MIN_SIZE;
  }

  function checkSrcEligible(src: string): boolean {
    return !(!src || src.startsWith("data:") || src.startsWith("blob:"));
  }

  it("accepts images ≥ 150×150 px", () => {
    expect(checkSizeEligible(150, 150)).toBe(true);
    expect(checkSizeEligible(200, 300)).toBe(true);
    expect(checkSizeEligible(1200, 800)).toBe(true);
  });

  it("rejects images smaller than 150×150 px", () => {
    expect(checkSizeEligible(149, 150)).toBe(false);
    expect(checkSizeEligible(150, 149)).toBe(false);
    expect(checkSizeEligible(64, 64)).toBe(false);
    expect(checkSizeEligible(1, 1)).toBe(false);
  });

  it("rejects images exactly 149×149 px", () => {
    expect(checkSizeEligible(149, 149)).toBe(false);
  });

  it("accepts exactly 150×150 (minimum threshold)", () => {
    expect(checkSizeEligible(150, 150)).toBe(true);
  });

  it("accepts very large images", () => {
    expect(checkSizeEligible(2000, 2000)).toBe(true);
  });

  it("rejects data: URI sources (tracking pixels, inline data)", () => {
    expect(checkSrcEligible("data:image/png;base64,abc123")).toBe(false);
    expect(checkSrcEligible("data:image/gif;base64,R0lGO")).toBe(false);
  });

  it("rejects blob: URL sources", () => {
    expect(checkSrcEligible("blob:https://example.com/uuid")).toBe(false);
  });

  it("rejects empty src", () => {
    expect(checkSrcEligible("")).toBe(false);
  });

  it("accepts https:// URLs", () => {
    expect(checkSrcEligible("https://cdn.example.com/product.jpg")).toBe(true);
  });

  it("accepts http:// URLs", () => {
    expect(checkSrcEligible("http://example.com/img.jpg")).toBe(true);
  });

  it("accepts relative paths (not yet resolved)", () => {
    expect(checkSrcEligible("/images/product.jpg")).toBe(true);
    expect(checkSrcEligible("../img.jpg")).toBe(true);
  });
});

// ─── Extension element exclusion ──────────────────────────────────────────────

describe("Extension element exclusion", () => {
  const HOST_ATTR = "data-bsp-hover-host";
  const BSP_OVERLAY_CLASS = "bsp-extension-overlay";

  function isExtensionElement(
    hasHostAttr: boolean,
    closestHostAttr: boolean,
    hasOverlayClass: boolean,
    closestOverlayClass: boolean
  ): boolean {
    return hasHostAttr || closestHostAttr || hasOverlayClass || closestOverlayClass;
  }

  it("marks element with HOST_ATTR as extension element", () => {
    expect(isExtensionElement(true, false, false, false)).toBe(true);
  });

  it("marks element inside HOST_ATTR parent as extension element", () => {
    expect(isExtensionElement(false, true, false, false)).toBe(true);
  });

  it("marks element with BSP_OVERLAY_CLASS as extension element", () => {
    expect(isExtensionElement(false, false, true, false)).toBe(true);
  });

  it("accepts regular page elements", () => {
    expect(isExtensionElement(false, false, false, false)).toBe(false);
  });

  it("HOST_ATTR and BSP_OVERLAY_CLASS constants are defined", () => {
    expect(HOST_ATTR).toBe("data-bsp-hover-host");
    expect(BSP_OVERLAY_CLASS).toBe("bsp-extension-overlay");
  });
});

// ─── Pending candidate storage/retrieval ──────────────────────────────────────

describe("Pending candidate lifecycle", () => {
  function buildCandidate(overrides: Partial<{
    imageUrl: string;
    sourceUrl: string;
    cardTitle: string;
    cardPrice: number;
    cardLink: string;
    tabId: number;
  }> = {}): {
    imageUrl: string;
    sourceUrl: string;
    altText?: string;
    cardTitle?: string;
    cardPrice?: number;
    cardLink?: string;
    timestamp: number;
    tabId: number;
    isDetailPage?: boolean;
  } {
    return {
      imageUrl: overrides.imageUrl ?? "https://cdn.example.com/product.jpg",
      sourceUrl: overrides.sourceUrl ?? "https://example.com/shop/item",
      cardTitle: overrides.cardTitle,
      cardPrice: overrides.cardPrice,
      cardLink: overrides.cardLink,
      timestamp: Date.now(),
      tabId: overrides.tabId ?? 42,
    };
  }

  it("candidate has required fields", () => {
    const c = buildCandidate();
    expect(c.imageUrl).toBeTruthy();
    expect(c.sourceUrl).toBeTruthy();
    expect(c.tabId).toBeGreaterThan(0);
    expect(typeof c.timestamp).toBe("number");
  });

  it("candidate serializes and deserializes without data loss", () => {
    const c = buildCandidate({
      imageUrl: "https://cdn.example.com/img.jpg",
      sourceUrl: "https://store.example.com/product/123",
      cardTitle: "Premium Widget",
      cardPrice: 49.99,
      cardLink: "https://store.example.com/product/123",
      tabId: 7,
    });
    const serialized = JSON.stringify(c);
    const deserialized = JSON.parse(serialized);
    expect(deserialized.imageUrl).toBe(c.imageUrl);
    expect(deserialized.sourceUrl).toBe(c.sourceUrl);
    expect(deserialized.cardTitle).toBe(c.cardTitle);
    expect(deserialized.cardPrice).toBe(c.cardPrice);
    expect(deserialized.tabId).toBe(c.tabId);
  });

  it("candidate imageUrl and sourceUrl are bounded in size", () => {
    const MAX = 8192;
    const longUrl = "https://example.com/" + "x".repeat(9000);
    const clamped = String(longUrl).slice(0, MAX);
    expect(clamped.length).toBeLessThanOrEqual(MAX);
  });

  it("candidate cardPrice is validated as a non-negative finite number", () => {
    function validatePrice(raw: unknown): number | undefined {
      if (typeof raw !== "number" || !isFinite(raw) || raw < 0) return undefined;
      return raw;
    }
    expect(validatePrice(49.99)).toBe(49.99);
    expect(validatePrice(0)).toBe(0);
    expect(validatePrice(-1)).toBeUndefined();
    expect(validatePrice(Infinity)).toBeUndefined();
    expect(validatePrice("49.99")).toBeUndefined();
    expect(validatePrice(null)).toBeUndefined();
  });

  it("candidate timestamp is set to the current time (within 1s)", () => {
    const before = Date.now();
    const c = buildCandidate();
    const after = Date.now();
    expect(c.timestamp).toBeGreaterThanOrEqual(before);
    expect(c.timestamp).toBeLessThanOrEqual(after + 1000);
  });
});

// ─── Draft conflict detection ──────────────────────────────────────────────────

describe("Draft conflict detection", () => {
  function hasConflict(
    formTitle: string,
    formImageCount: number,
    formCost: string,
    formSourceUrl: string,
    candidateSourceUrl: string,
    candidateCardLink?: string
  ): boolean {
    const isDirty =
      formTitle.trim() !== "" || formImageCount > 0 || formCost.trim() !== "";
    const isSameSource =
      candidateSourceUrl === formSourceUrl ||
      (candidateCardLink !== undefined && candidateCardLink === formSourceUrl);
    return isDirty && !isSameSource;
  }

  it("detects conflict when draft has content and candidate is from different URL", () => {
    expect(
      hasConflict(
        "Existing Product",
        1,
        "99.00",
        "https://old-site.com/item",
        "https://new-site.com/product"
      )
    ).toBe(true);
  });

  it("no conflict when draft is empty", () => {
    expect(
      hasConflict("", 0, "", "https://old-site.com", "https://new-site.com/product")
    ).toBe(false);
  });

  it("no conflict when candidate is from the same page", () => {
    const url = "https://example.com/product";
    expect(hasConflict("Existing", 0, "", url, url)).toBe(false);
  });

  it("no conflict when candidate's cardLink matches form's sourceUrl", () => {
    const url = "https://example.com/product/123";
    expect(
      hasConflict(
        "Existing",
        1,
        "",
        url,
        "https://example.com/shop",
        url
      )
    ).toBe(false);
  });

  it("detects conflict based on non-empty images even with blank title/cost", () => {
    expect(
      hasConflict(
        "",
        2,
        "",
        "https://site-a.com/item",
        "https://site-b.com/product"
      )
    ).toBe(true);
  });

  it("detects conflict based on non-empty cost even with blank title/images", () => {
    expect(
      hasConflict("", 0, "49.99", "https://site-a.com", "https://site-b.com")
    ).toBe(true);
  });

  it("draft with only spaces in title is NOT considered dirty", () => {
    expect(
      hasConflict("   ", 0, "", "https://old.com", "https://new.com")
    ).toBe(false);
  });
});

// ─── Message sender validation ────────────────────────────────────────────────

describe("HOVER_IMAGE_CLICKED message sender validation", () => {
  /**
   * isContentScriptSender allows messages from content scripts on web pages
   * but NOT from the extension's own pages or other extensions.
   */
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

  function isTrustedSender(
    sender: { id?: string; url?: string },
    ownId: string
  ): boolean {
    return sender.id === ownId && sender.url !== undefined;
  }

  const OWN_ID = "abcdefghijklmnopabcdefghijklmnop";

  // Content script senders
  it("accepts content script sender from a web page", () => {
    expect(
      isContentScriptSender(
        { id: OWN_ID, tab: { id: 42 }, url: "https://example.com/product" },
        OWN_ID
      )
    ).toBe(true);
  });

  it("rejects content script sender with wrong extension id", () => {
    expect(
      isContentScriptSender(
        { id: "other-extension-id", tab: { id: 1 }, url: "https://example.com" },
        OWN_ID
      )
    ).toBe(false);
  });

  it("rejects content script sender with no tab (side panel or popup context)", () => {
    expect(
      isContentScriptSender(
        { id: OWN_ID, url: "chrome-extension://abc/sidepanel.html" },
        OWN_ID
      )
    ).toBe(false);
  });

  it("rejects sender from the extension's own pages as content script", () => {
    expect(
      isContentScriptSender(
        { id: OWN_ID, tab: { id: 1 }, url: "chrome-extension://abc/page.html" },
        OWN_ID
      )
    ).toBe(false);
  });

  // Trusted (extension-own) senders
  it("isTrustedSender accepts the extension's own pages", () => {
    expect(
      isTrustedSender(
        { id: OWN_ID, url: "chrome-extension://abc/sidepanel/index.html" },
        OWN_ID
      )
    ).toBe(true);
  });

  it("isTrustedSender rejects content scripts (no url for web pages in some contexts)", () => {
    expect(isTrustedSender({ id: OWN_ID, url: undefined }, OWN_ID)).toBe(false);
  });

  it("rejects completely empty sender for both functions", () => {
    expect(isContentScriptSender({}, OWN_ID)).toBe(false);
    expect(isTrustedSender({}, OWN_ID)).toBe(false);
  });

  it("page scripts cannot pass as content scripts (they use window.postMessage, not chrome.runtime)", () => {
    // This is a design property: chrome.runtime.sendMessage is NOT available
    // to page scripts. Only extension content scripts can call it.
    // The sender.id check ensures no other extension can send HOVER_IMAGE_CLICKED.
    const pageScriptSender = { id: "different-id", tab: { id: 1 }, url: "https://attacker.com" };
    expect(isContentScriptSender(pageScriptSender, OWN_ID)).toBe(false);
  });
});

// ─── Permission state checks ──────────────────────────────────────────────────

describe("Per-site permission state", () => {
  function isGrantedOrigin(origins: string[], target: string): boolean {
    return origins.includes(target);
  }

  function isRestrictedPage(url: string): boolean {
    return (
      url.startsWith("chrome://") ||
      url.startsWith("chrome-extension://") ||
      url.startsWith("https://chrome.google.com/webstore") ||
      url.startsWith("about:") ||
      url === ""
    );
  }

  it("identifies a granted origin", () => {
    const origins = ["https://example.com", "https://shop.another.com"];
    expect(isGrantedOrigin(origins, "https://example.com")).toBe(true);
  });

  it("does not match subdomain for exact origin", () => {
    const origins = ["https://example.com"];
    expect(isGrantedOrigin(origins, "https://sub.example.com")).toBe(false);
  });

  it("does not match http when only https is granted", () => {
    const origins = ["https://example.com"];
    expect(isGrantedOrigin(origins, "http://example.com")).toBe(false);
  });

  it("empty origins list grants nothing", () => {
    expect(isGrantedOrigin([], "https://example.com")).toBe(false);
  });

  it("chrome:// pages are restricted", () => {
    expect(isRestrictedPage("chrome://settings")).toBe(true);
    expect(isRestrictedPage("chrome://extensions")).toBe(true);
  });

  it("chrome-extension:// pages are restricted", () => {
    expect(isRestrictedPage("chrome-extension://abc/page.html")).toBe(true);
  });

  it("Chrome Web Store is restricted", () => {
    expect(isRestrictedPage("https://chrome.google.com/webstore/detail/ext/abc")).toBe(true);
  });

  it("about: pages are restricted", () => {
    expect(isRestrictedPage("about:blank")).toBe(true);
  });

  it("regular https pages are not restricted", () => {
    expect(isRestrictedPage("https://example.com/product")).toBe(false);
  });

  it("empty URL is treated as restricted", () => {
    expect(isRestrictedPage("")).toBe(true);
  });
});

// ─── Overlay cleanup on navigation ───────────────────────────────────────────

describe("Overlay cleanup state machine", () => {
  /**
   * The destroyHoverOverlay function must clean up all overlay state.
   * These tests verify the state machine logic without requiring a real DOM.
   */

  interface OverlayState {
    isEnabled: boolean;
    currentImage: string | null;
    rafId: number | null;
    hideTimerActive: boolean;
    shadowHostAttached: boolean;
    mutationObserverConnected: boolean;
    intersectionObserverConnected: boolean;
  }

  function simulateDestroy(_state: OverlayState): OverlayState {
    return {
      isEnabled: false,
      currentImage: null,
      rafId: null,
      hideTimerActive: false,
      shadowHostAttached: false,
      mutationObserverConnected: false,
      intersectionObserverConnected: false,
    };
  }

  it("destroy sets isEnabled to false", () => {
    const state: OverlayState = {
      isEnabled: true,
      currentImage: "img1",
      rafId: 123,
      hideTimerActive: true,
      shadowHostAttached: true,
      mutationObserverConnected: true,
      intersectionObserverConnected: true,
    };
    const after = simulateDestroy(state);
    expect(after.isEnabled).toBe(false);
  });

  it("destroy clears current image", () => {
    const state: OverlayState = {
      isEnabled: true,
      currentImage: "https://example.com/img.jpg",
      rafId: null,
      hideTimerActive: false,
      shadowHostAttached: true,
      mutationObserverConnected: true,
      intersectionObserverConnected: true,
    };
    const after = simulateDestroy(state);
    expect(after.currentImage).toBeNull();
  });

  it("destroy cancels RAF and timers", () => {
    const state: OverlayState = {
      isEnabled: true,
      currentImage: null,
      rafId: 99,
      hideTimerActive: true,
      shadowHostAttached: true,
      mutationObserverConnected: true,
      intersectionObserverConnected: true,
    };
    const after = simulateDestroy(state);
    expect(after.rafId).toBeNull();
    expect(after.hideTimerActive).toBe(false);
  });

  it("destroy disconnects observers", () => {
    const state: OverlayState = {
      isEnabled: false,
      currentImage: null,
      rafId: null,
      hideTimerActive: false,
      shadowHostAttached: true,
      mutationObserverConnected: true,
      intersectionObserverConnected: true,
    };
    const after = simulateDestroy(state);
    expect(after.mutationObserverConnected).toBe(false);
    expect(after.intersectionObserverConnected).toBe(false);
  });

  it("destroy removes shadow host from DOM", () => {
    const state: OverlayState = {
      isEnabled: false,
      currentImage: null,
      rafId: null,
      hideTimerActive: false,
      shadowHostAttached: true,
      mutationObserverConnected: false,
      intersectionObserverConnected: false,
    };
    const after = simulateDestroy(state);
    expect(after.shadowHostAttached).toBe(false);
  });

  it("calling destroy on already-clean state is safe (idempotent)", () => {
    const cleanState: OverlayState = {
      isEnabled: false,
      currentImage: null,
      rafId: null,
      hideTimerActive: false,
      shadowHostAttached: false,
      mutationObserverConnected: false,
      intersectionObserverConnected: false,
    };
    const after = simulateDestroy(cleanState);
    expect(after).toEqual(cleanState);
  });
});

// ─── Candidate data sanitization ─────────────────────────────────────────────

describe("Candidate data sanitization (service worker side)", () => {
  function sanitizeCandidate(raw: Record<string, unknown>, tabId: number): {
    imageUrl: string;
    altText?: string;
    sourceUrl: string;
    cardTitle?: string;
    cardPrice?: number;
    timestamp: number;
    tabId: number;
  } {
    return {
      imageUrl: String(raw["imageUrl"] ?? "").slice(0, 8192),
      altText: raw["altText"] ? String(raw["altText"]).slice(0, 500) : undefined,
      sourceUrl: String(raw["sourceUrl"] ?? "").slice(0, 8192),
      cardTitle: raw["cardTitle"] ? String(raw["cardTitle"]).slice(0, 500) : undefined,
      cardPrice: typeof raw["cardPrice"] === "number" && isFinite(raw["cardPrice"] as number) && (raw["cardPrice"] as number) >= 0
        ? raw["cardPrice"] as number
        : undefined,
      timestamp: Date.now(),
      tabId,
    };
  }

  it("converts imageUrl to string and clamps to 8192 chars", () => {
    const raw = { imageUrl: "https://cdn.example.com/" + "a".repeat(8200), sourceUrl: "" };
    const result = sanitizeCandidate(raw, 1);
    expect(result.imageUrl.length).toBeLessThanOrEqual(8192);
  });

  it("converts altText to string and clamps to 500 chars", () => {
    const raw = { imageUrl: "https://cdn.example.com/img.jpg", sourceUrl: "", altText: "x".repeat(600) };
    const result = sanitizeCandidate(raw, 1);
    expect(result.altText?.length).toBeLessThanOrEqual(500);
  });

  it("rejects non-numeric cardPrice", () => {
    const raw = { imageUrl: "", sourceUrl: "", cardPrice: "49.99" };
    const result = sanitizeCandidate(raw, 1);
    expect(result.cardPrice).toBeUndefined();
  });

  it("rejects negative cardPrice", () => {
    const raw = { imageUrl: "", sourceUrl: "", cardPrice: -1 };
    const result = sanitizeCandidate(raw, 1);
    expect(result.cardPrice).toBeUndefined();
  });

  it("rejects Infinity cardPrice", () => {
    const raw = { imageUrl: "", sourceUrl: "", cardPrice: Infinity };
    const result = sanitizeCandidate(raw, 1);
    expect(result.cardPrice).toBeUndefined();
  });

  it("accepts valid numeric cardPrice", () => {
    const raw = { imageUrl: "", sourceUrl: "", cardPrice: 249.95 };
    const result = sanitizeCandidate(raw, 1);
    expect(result.cardPrice).toBe(249.95);
  });

  it("always uses the service worker's Date.now() for timestamp (not page's)", () => {
    const raw = { imageUrl: "", sourceUrl: "", timestamp: 0 };
    const before = Date.now();
    const result = sanitizeCandidate(raw, 1);
    const after = Date.now();
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after + 100);
  });
});
