/**
 * Content Script – product extraction and click-to-pick interactions.
 *
 * IMPORTANT SECURITY CONSTRAINTS (enforced in all stages):
 * - This file MUST NOT import from storage.ts or access chrome.storage directly.
 * - The connection key MUST NEVER be sent to this script or appear here.
 * - All data extracted from pages is treated as untrusted user content.
 * - Communication with the service worker uses chrome.runtime.sendMessage
 *   only for non-privileged, page-derived data (never credentials).
 *
 * All text from the page is treated as untrusted – never injected as HTML.
 */

import type {
  ExtractionResult,
  PriceCandidate,
  ContentMessage,
  MessageResponse,
} from "../types/index.js";
import {
  initHoverOverlay,
  enableHover,
  disableHover,
  destroyHoverOverlay,
} from "./hover.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_JSONLD_BLOCKS = 10;
const MAX_PRICE_CANDIDATES = 5;
const MAX_IMAGE_CANDIDATES = 10;
const MAX_SHADOW_DEPTH = 3;
const BSP_OVERLAY_CLASS = "bsp-extension-overlay";

// ─── JSON-LD Extraction ───────────────────────────────────────────────────────

interface JsonLdProduct {
  "@type"?: string | string[];
  name?: string;
  description?: string;
  image?: string | string[] | { url?: string } | Array<{ url?: string }>;
  url?: string;
  sku?: string;
  brand?: { name?: string } | string;
  offers?: JsonLdOffer | JsonLdOffer[];
  manufacturer?: { name?: string } | string;
  color?: string;
  material?: string;
  category?: string;
}

interface JsonLdOffer {
  "@type"?: string;
  price?: number | string;
  priceCurrency?: string;
  priceSpecification?: unknown;
  lowPrice?: number | string;
  highPrice?: number | string;
  priceValidUntil?: string;
  availability?: string;
  description?: string;
}

function isProductNode(node: unknown): node is JsonLdProduct {
  if (typeof node !== "object" || node === null) return false;
  const n = node as Record<string, unknown>;
  const type = n["@type"];
  if (typeof type === "string") return type === "Product";
  if (Array.isArray(type)) return type.includes("Product");
  return false;
}

function findProductInJsonLd(parsed: unknown): JsonLdProduct | null {
  if (isProductNode(parsed)) return parsed as JsonLdProduct;
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  // @graph array
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) {
      if (isProductNode(item)) return item as JsonLdProduct;
    }
  }

  // Top-level array
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (isProductNode(item)) return item as JsonLdProduct;
    }
  }

  return null;
}

function resolveImageUrl(raw: string, base: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, base);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    // ignore
  }
  return null;
}

function extractImages(
  imageField: JsonLdProduct["image"],
  base: string
): string[] {
  const results: string[] = [];
  if (!imageField) return results;

  const candidates: string[] = [];
  if (typeof imageField === "string") {
    candidates.push(imageField);
  } else if (Array.isArray(imageField)) {
    for (const item of imageField) {
      if (typeof item === "string") candidates.push(item);
      else if (typeof item === "object" && item !== null) {
        const u = (item as { url?: string }).url;
        if (u) candidates.push(u);
      }
    }
  } else if (typeof imageField === "object" && imageField !== null) {
    const u = (imageField as { url?: string }).url;
    if (u) candidates.push(u);
  }

  for (const c of candidates) {
    const resolved = resolveImageUrl(c, base);
    if (resolved && !results.includes(resolved)) {
      results.push(resolved);
      if (results.length >= MAX_IMAGE_CANDIDATES) break;
    }
  }
  return results;
}

/** Parse price from a JSON-LD offer, returning null if ambiguous or non-numeric. */
function parseOfferPrice(offer: JsonLdOffer): {
  value: number | null;
  currency: string | null;
  context: string;
} {
  const currency =
    typeof offer.priceCurrency === "string" ? offer.priceCurrency : null;

  // Reject price ranges
  if (offer.lowPrice !== undefined || offer.highPrice !== undefined) {
    return {
      value: null,
      currency,
      context: "price range — skipped",
    };
  }

  const raw = offer.price;
  let value: number | null = null;

  if (typeof raw === "number" && isFinite(raw) && raw >= 0) {
    value = raw;
  } else if (typeof raw === "string") {
    const cleaned = raw.replace(/[,$\s]/g, "");
    const parsed = parseFloat(cleaned);
    if (isFinite(parsed) && parsed >= 0) {
      value = parsed;
    }
  }

  const ctx =
    typeof offer.description === "string"
      ? offer.description.slice(0, 60)
      : `offer price ${String(raw)}`;
  return { value, currency, context: ctx };
}

function extractFromJsonLd(pageUrl: string): Partial<ExtractionResult> | null {
  const scripts = document.querySelectorAll(
    'script[type="application/ld+json"]'
  );
  const limit = Math.min(scripts.length, MAX_JSONLD_BLOCKS);
  let product: JsonLdProduct | null = null;

  for (let i = 0; i < limit; i++) {
    const text = scripts[i].textContent;
    if (!text) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    product = findProductInJsonLd(parsed);
    if (product) break;
  }

  if (!product) return null;

  const result: Partial<ExtractionResult> = {};

  if (typeof product.name === "string" && product.name.trim()) {
    result.title = product.name.trim().slice(0, 500);
  }

  if (typeof product.description === "string" && product.description.trim()) {
    result.description = product.description.trim().slice(0, 20000);
  }

  if (typeof product.url === "string") {
    const resolved = resolveImageUrl(product.url, pageUrl);
    if (resolved) result.sourceUrl = resolved;
  }

  if (typeof product.sku === "string" && product.sku.trim()) {
    result.sku = product.sku.trim().slice(0, 200);
  }

  const brand = product.brand;
  if (typeof brand === "string" && brand.trim()) {
    result.manufacturer = brand.trim().slice(0, 200);
  } else if (
    typeof brand === "object" &&
    brand !== null &&
    typeof (brand as { name?: string }).name === "string"
  ) {
    result.manufacturer = (brand as { name: string }).name.trim().slice(0, 200);
  }

  const mfr = product.manufacturer;
  if (typeof mfr === "string" && mfr.trim()) {
    result.manufacturer = mfr.trim().slice(0, 200);
  } else if (
    typeof mfr === "object" &&
    mfr !== null &&
    typeof (mfr as { name?: string }).name === "string"
  ) {
    result.manufacturer = (mfr as { name: string }).name.trim().slice(0, 200);
  }

  if (typeof product.color === "string" && product.color.trim()) {
    result.finishColor = product.color.trim().slice(0, 200);
  }
  if (typeof product.material === "string" && product.material.trim()) {
    result.composition = product.material.trim().slice(0, 200);
  }
  if (typeof product.category === "string" && product.category.trim()) {
    result.category = product.category.trim().slice(0, 500);
  }

  result.imageUrls = extractImages(product.image, pageUrl);

  // Process offers
  const offersRaw = product.offers;
  if (offersRaw) {
    const offers: JsonLdOffer[] = Array.isArray(offersRaw)
      ? offersRaw
      : [offersRaw];
    const priceCandidates: PriceCandidate[] = [];

    for (const offer of offers) {
      const { value, currency, context } = parseOfferPrice(offer);
      if (value === null) continue;
      if (value > 100000000) continue;

      const curr = currency?.toUpperCase() ?? null;
      if (curr === null || curr === "USD") {
        priceCandidates.push({ value, context });
      } else {
        result.currency = currency ?? undefined;
        result.currencyWarning = `Price left blank: currency was not clearly USD (found ${currency})`;
      }
    }

    if (priceCandidates.length === 1) {
      result.cost = priceCandidates[0].value;
    } else if (priceCandidates.length > 1) {
      result.priceCandidates = priceCandidates.slice(0, MAX_PRICE_CANDIDATES);
    }
  }

  return result;
}

// ─── Open Graph / Meta Extraction ────────────────────────────────────────────

function getMetaContent(name: string): string | null {
  const el =
    document.querySelector(`meta[property="${name}"]`) ||
    document.querySelector(`meta[name="${name}"]`);
  const content = el?.getAttribute("content");
  return content?.trim() || null;
}

function extractFromOg(pageUrl: string): Partial<ExtractionResult> {
  const result: Partial<ExtractionResult> = {};
  const title = getMetaContent("og:title");
  if (title) result.title = title.slice(0, 500);

  const desc = getMetaContent("og:description");
  if (desc) result.description = desc.slice(0, 20000);

  const image = getMetaContent("og:image");
  if (image) {
    const resolved = resolveImageUrl(image, pageUrl);
    if (resolved) result.imageUrls = [resolved];
  }

  const url = getMetaContent("og:url");
  if (url) {
    const resolved = resolveImageUrl(url, pageUrl);
    if (resolved) result.sourceUrl = resolved;
  }

  return result;
}

// ─── DOM / Shadow Traversal ───────────────────────────────────────────────────

function _collectTextFromShadowRoots(
  root: Element | ShadowRoot,
  depth: number,
  results: string[]
): void {
  if (depth > MAX_SHADOW_DEPTH) return;
  const children = root.querySelectorAll("*");
  for (const child of children) {
    if (child.shadowRoot) {
      _collectTextFromShadowRoots(child.shadowRoot, depth + 1, results);
    }
  }
}
// Reserved for future shadow-root text extraction — not currently called
void _collectTextFromShadowRoots;

function isOwnOverlay(el: Element): boolean {
  return (
    el.classList.contains(BSP_OVERLAY_CLASS) ||
    el.closest(`.${BSP_OVERLAY_CLASS}`) !== null
  );
}

/** Extract visible h1 text, ignoring extension overlays. */
function getH1Title(): string | null {
  const h1s = document.querySelectorAll("h1");
  for (const h1 of h1s) {
    if (isOwnOverlay(h1)) continue;
    const text = h1.textContent?.trim();
    if (text) return text.slice(0, 500);
  }
  return null;
}

// Price-related patterns
const PRICE_PATTERN =
  /\$\s*(\d{1,7}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d{1,10}(?:\.\d{1,2})?)/g;
const SKIP_PRICE_CONTEXTS = [
  /shipping/i,
  /delivery/i,
  /\bfrom\b/i,
  /starting\s+at/i,
  /as\s+low\s+as/i,
  /monthly/i,
  /per\s+month/i,
  /\bmo\b/i,
  /payment/i,
  /recommended/i,
];

function contextLooksSkippable(context: string): boolean {
  return SKIP_PRICE_CONTEXTS.some((re) => re.test(context));
}

function extractDomPrices(): PriceCandidate[] {
  const candidates: PriceCandidate[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    if (!(node.parentElement instanceof Element)) continue;
    if (!isVisible(node.parentElement)) continue;
    if (isOwnOverlay(node.parentElement)) continue;

    const text = node.textContent ?? "";
    let match: RegExpExecArray | null;
    PRICE_PATTERN.lastIndex = 0;

    while ((match = PRICE_PATTERN.exec(text)) !== null) {
      const raw = match[1].replace(/,/g, "");
      const value = parseFloat(raw);
      if (!isFinite(value) || value < 0 || value > 100000000) continue;

      const context = text
        .slice(Math.max(0, match.index - 30), match.index + match[0].length + 30)
        .trim();
      if (contextLooksSkippable(context)) continue;

      // Deduplicate by value
      if (!candidates.some((c) => c.value === value)) {
        candidates.push({ value, context: context.slice(0, 80) });
        if (candidates.length >= MAX_PRICE_CANDIDATES) break;
      }
    }

    if (candidates.length >= MAX_PRICE_CANDIDATES) break;
  }

  return candidates;
}

function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

function collectDomImages(pageUrl: string): string[] {
  const images: string[] = [];
  const imgs = document.querySelectorAll("img");

  for (const img of imgs) {
    if (isOwnOverlay(img)) continue;
    if (!isVisible(img)) continue;
    if (img.width < 50 || img.height < 50) continue;

    const srcs = [
      img.currentSrc,
      img.src,
      img.getAttribute("data-src"),
      img.getAttribute("data-lazy-src"),
      img.getAttribute("data-original"),
    ].filter(Boolean) as string[];

    // Also parse srcset
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      srcset
        .split(",")
        .map((s) => s.trim().split(/\s+/)[0])
        .filter(Boolean)
        .forEach((s) => srcs.push(s));
    }

    for (const src of srcs) {
      const resolved = resolveImageUrl(src, pageUrl);
      if (resolved && !images.includes(resolved)) {
        images.push(resolved);
        if (images.length >= MAX_IMAGE_CANDIDATES) return images;
      }
    }
  }

  return images;
}

function extractFromDom(pageUrl: string): Partial<ExtractionResult> {
  const result: Partial<ExtractionResult> = {};

  const title = getH1Title();
  if (title) result.title = title;

  const priceCandidates = extractDomPrices();
  if (priceCandidates.length === 1) {
    result.cost = priceCandidates[0].value;
  } else if (priceCandidates.length > 1) {
    result.priceCandidates = priceCandidates;
  }

  const supplierMeta =
    document.querySelector('meta[name="author"]')?.getAttribute("content") ||
    document.querySelector('meta[property="og:site_name"]')?.getAttribute(
      "content"
    ) ||
    null;
  if (supplierMeta?.trim()) {
    result.supplierName = supplierMeta.trim().slice(0, 200);
  }

  result.imageUrls = collectDomImages(pageUrl);

  return result;
}

// ─── Main Extraction ──────────────────────────────────────────────────────────

function mergeResults(
  base: Partial<ExtractionResult>,
  overlay: Partial<ExtractionResult>
): Partial<ExtractionResult> {
  const merged: Partial<ExtractionResult> = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    const key = k as keyof ExtractionResult;
    if (v === undefined) continue;
    if (key === "imageUrls") {
      const baseUrls = (base.imageUrls ?? []) as string[];
      const overlayUrls = (v as string[]) ?? [];
      const combined = [
        ...baseUrls,
        ...overlayUrls.filter((u) => !baseUrls.includes(u)),
      ];
      (merged as Record<string, unknown>)[key] = combined.slice(
        0,
        MAX_IMAGE_CANDIDATES
      );
    } else if (key === "priceCandidates") {
      if (!merged.priceCandidates) {
        (merged as Record<string, unknown>)[key] = v;
      }
    } else {
      if (!(key in merged) || merged[key] === undefined) {
        (merged as Record<string, unknown>)[key] = v;
      }
    }
  }
  return merged;
}

export function extractProduct(): ExtractionResult {
  const pageUrl = window.location.href;

  const jsonLdResult = extractFromJsonLd(pageUrl);
  const ogResult = extractFromOg(pageUrl);
  const domResult = extractFromDom(pageUrl);

  // Priority: JSON-LD > OG > DOM
  let merged: Partial<ExtractionResult> = {};
  merged = mergeResults(merged, domResult);
  merged = mergeResults(merged, ogResult);
  if (jsonLdResult !== null) {
    merged = mergeResults(merged, jsonLdResult);
  }

  // Determine source URL
  const sourceUrl = merged.sourceUrl || pageUrl;

  const imageUrls = (merged.imageUrls ?? []).slice(0, MAX_IMAGE_CANDIDATES);

  return {
    title: merged.title,
    sourceUrl,
    description: merged.description,
    cost: merged.cost,
    msrp: merged.msrp,
    currency: merged.currency,
    currencyWarning: merged.currencyWarning,
    supplierName: merged.supplierName,
    manufacturer: merged.manufacturer,
    sku: merged.sku,
    dimensions: merged.dimensions,
    finishColor: merged.finishColor,
    composition: merged.composition,
    category: merged.category,
    imageUrls,
    priceCandidates: merged.priceCandidates,
  };
}

// ─── Click-to-Pick ────────────────────────────────────────────────────────────

type PickMode = "text" | "image";

interface PickState {
  mode: PickMode;
  overlay: HTMLDivElement;
  resolve: (value: string | null) => void;
}

let currentPick: PickState | null = null;

function teardownPick(): void {
  if (!currentPick) return;
  const { overlay } = currentPick;
  document.removeEventListener("click", onPickClick, true);
  document.removeEventListener("mouseover", onPickHover, true);
  document.removeEventListener("keydown", onPickKeydown, true);
  overlay.remove();
  currentPick = null;
}

function onPickClick(e: MouseEvent): void {
  if (!currentPick) return;
  e.preventDefault();
  e.stopPropagation();

  const target = e.target as Element;
  if (isOwnOverlay(target)) return;

  if (currentPick.mode === "text") {
    const text = target.textContent?.trim() || "";
    const resolve = currentPick.resolve;
    teardownPick();
    resolve(text || null);
  } else {
    let imgSrc: string | null = null;
    if (target instanceof HTMLImageElement) {
      imgSrc =
        resolveImageUrl(target.currentSrc || target.src, window.location.href);
    } else {
      const img = target.querySelector("img");
      if (img) {
        imgSrc = resolveImageUrl(
          img.currentSrc || img.src,
          window.location.href
        );
      }
    }
    const resolve = currentPick.resolve;
    teardownPick();
    resolve(imgSrc);
  }
}

let lastHovered: Element | null = null;

function onPickHover(e: MouseEvent): void {
  if (!currentPick) return;
  const target = e.target as Element;
  if (isOwnOverlay(target)) return;

  if (lastHovered && lastHovered !== target) {
    (lastHovered as HTMLElement).style.removeProperty("outline");
    (lastHovered as HTMLElement).style.removeProperty("outline-offset");
  }
  if (target instanceof HTMLElement) {
    target.style.outline = "2px solid #B8962E";
    target.style.outlineOffset = "1px";
    lastHovered = target;
  }
}

function onPickKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    if (lastHovered instanceof HTMLElement) {
      lastHovered.style.removeProperty("outline");
      lastHovered.style.removeProperty("outline-offset");
      lastHovered = null;
    }
    const resolve = currentPick?.resolve;
    teardownPick();
    resolve?.(null);
  }
}

function startPick(mode: PickMode): Promise<string | null> {
  if (currentPick) teardownPick();

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = BSP_OVERLAY_CLASS;
    overlay.style.cssText = [
      "position: fixed",
      "top: 0",
      "left: 0",
      "width: 100%",
      "z-index: 2147483646",
      "pointer-events: none",
      "font-family: sans-serif",
      "font-size: 13px",
      "background: rgba(184,150,46,0.15)",
      "border-bottom: 2px solid #B8962E",
      "color: #000",
      "padding: 6px 12px",
      "box-sizing: border-box",
    ].join(";");
    overlay.textContent =
      mode === "text"
        ? "Click any text on the page to pick it. Press Esc to cancel."
        : "Click any image on the page to pick it. Press Esc to cancel.";
    document.body.appendChild(overlay);

    currentPick = { mode, overlay, resolve };
    document.addEventListener("click", onPickClick, true);
    document.addEventListener("mouseover", onPickHover, true);
    document.addEventListener("keydown", onPickKeydown, true);
  });
}

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    const msg = message as ContentMessage;

    switch (msg.type) {
      case "EXTRACT_PRODUCT": {
        try {
          const result = extractProduct();
          sendResponse({ ok: true, data: result });
        } catch (err) {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : "Extraction failed",
          });
        }
        return false;
      }

      case "START_PICK_TEXT": {
        startPick("text").then((value) => {
          sendResponse({ ok: true, data: value });
        });
        return true;
      }

      case "START_PICK_IMAGE": {
        startPick("image").then((value) => {
          sendResponse({ ok: true, data: value });
        });
        return true;
      }

      case "CANCEL_PICK": {
        if (currentPick) {
          const resolve = currentPick.resolve;
          teardownPick();
          resolve(null);
        }
        sendResponse({ ok: true, data: null });
        return false;
      }

      case "ENABLE_HOVER": {
        enableHover();
        sendResponse({ ok: true, data: null });
        return false;
      }

      case "DISABLE_HOVER": {
        disableHover();
        sendResponse({ ok: true, data: null });
        return false;
      }

      default:
        return false;
    }
  }
);

// ─── Hover overlay initialization ────────────────────────────────────────────

// Initialize the hover overlay (dormant by default).
// The service worker will send ENABLE_HOVER if this origin has hover permitted.
const bspLogoUrl = chrome.runtime.getURL("icons/bsp-logo.png");
initHoverOverlay(bspLogoUrl);

// Query service worker for the current site's hover state on init
(function checkHoverState() {
  try {
    const origin = window.location.origin;
    chrome.runtime.sendMessage(
      { type: "GET_HOVER_SITE_STATE", origin },
      (response: MessageResponse<{ isEnabled: boolean }>) => {
        if (chrome.runtime.lastError) return; // SW not ready yet — ignore
        if (response?.ok && response.data?.isEnabled) {
          enableHover();
        }
      }
    );
  } catch {
    // Ignore errors from restricted pages (chrome://, chrome-extension://)
  }
})();

// Cleanup on page unload (SPA navigation)
window.addEventListener("pagehide", () => {
  destroyHoverOverlay();
});

export {};
