/**
 * Hover overlay system – Shadow DOM-based pick button for product images.
 *
 * SECURITY CONSTRAINTS (enforced throughout):
 * - No access to chrome.storage directly (uses chrome.runtime.sendMessage)
 * - Connection key NEVER accessed here
 * - All page data treated as untrusted
 * - Uses Shadow DOM (mode: 'closed') for complete style isolation
 * - Does NOT modify supplier DOM structure
 *
 * ARCHITECTURE:
 * - One active hover overlay at a time (not thousands of permanent buttons)
 * - Delegates mouseover events on document (not per-image listeners)
 * - Overlay positioned via position:fixed + requestAnimationFrame tracking
 * - Flicker prevention: 80ms delay before hiding on mouseleave
 * - Cleans up observers and listeners on teardown
 */

import type { PendingCandidate } from "../types/index.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_IMAGE_SIZE = 150; // minimum CSS px for eligible images
const BUTTON_SIZE = 46;     // px
const INSET = 10;           // px inset from image corner
const HIDE_DELAY_MS = 80;   // ms delay before hiding button after mouseleave
const HOST_ATTR = "data-bsp-hover-host";
const BSP_OVERLAY_CLASS = "bsp-extension-overlay";

// ─── State ────────────────────────────────────────────────────────────────────

let isEnabled = false;
let currentImage: HTMLImageElement | null = null;
let shadowHost: HTMLElement | null = null;
let shadowBtn: HTMLButtonElement | null = null;
let intersectionObserver: IntersectionObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let rafId: number | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let logoUrl = "";

// ─── Image eligibility ────────────────────────────────────────────────────────

/**
 * Returns true if the image should receive a hover pick button.
 * Conservative heuristics: relies primarily on rendered size.
 */
export function isEligibleImage(img: HTMLImageElement): boolean {
  // Skip extension-owned elements
  if (img.hasAttribute(HOST_ATTR)) return false;
  if (img.closest(`[${HOST_ATTR}]`)) return false;
  if (img.classList.contains(BSP_OVERLAY_CLASS)) return false;
  if (img.closest(`.${BSP_OVERLAY_CLASS}`)) return false;

  // Must be a real rendered image
  const src = img.currentSrc || img.src;
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return false;

  // Minimum rendered size
  const rect = img.getBoundingClientRect();
  if (rect.width < MIN_IMAGE_SIZE || rect.height < MIN_IMAGE_SIZE) return false;

  // Must be visible
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(img);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    parseFloat(style.opacity || "1") < 0.1
  ) {
    return false;
  }

  return true;
}

/**
 * Walk up from a DOM element to find the nearest eligible <img>.
 * Returns null if no eligible image is found within a reasonable depth.
 */
function findEligibleImageFromTarget(el: EventTarget | null): HTMLImageElement | null {
  if (!(el instanceof Element)) return null;

  let node: Element | null = el;
  for (let depth = 0; depth < 6; depth++) {
    if (!node) break;
    if (node instanceof HTMLImageElement && isEligibleImage(node)) {
      return node;
    }
    // Skip extension overlay elements
    if (node.hasAttribute(HOST_ATTR)) return null;
    node = node.parentElement;
  }
  return null;
}

// ─── Card context extraction ──────────────────────────────────────────────────

/**
 * Extracts minimal product context from the card containing the clicked image.
 * Used to pre-populate the panel form. All data is treated as untrusted.
 */
function extractCardContext(img: HTMLImageElement): Pick<PendingCandidate, "cardTitle" | "cardPrice" | "cardLink"> {
  const context: Pick<PendingCandidate, "cardTitle" | "cardPrice" | "cardLink"> = {};

  // Find containing product card
  let productCard: Element | null = null;
  let node: Element | null = img;

  for (let i = 0; i < 12; i++) {
    if (!node || node === document.body) break;

    if (
      node.tagName === "ARTICLE" ||
      node.matches("[itemtype*='Product']") ||
      node.matches("[itemscope]") ||
      node.hasAttribute("data-product-id") ||
      node.hasAttribute("data-item-id") ||
      node.hasAttribute("data-sku") ||
      (node.tagName === "LI" &&
        node.querySelector("a[href]") !== null &&
        node.querySelector("img") !== null)
    ) {
      productCard = node;
      break;
    }
    node = node.parentElement;
  }

  const ctx = productCard ?? img.closest("a") ?? img.parentElement;
  if (!ctx) return context;

  // Title: prefer itemprop="name", then heading, then img alt
  const titleEl =
    ctx.querySelector("[itemprop='name']") ??
    ctx.querySelector("h1, h2, h3, h4") ??
    null;
  const titleText = titleEl?.textContent?.trim();
  if (titleText) {
    context.cardTitle = titleText.slice(0, 500);
  } else if (img.alt?.trim()) {
    context.cardTitle = img.alt.trim().slice(0, 500);
  }

  // Price: prefer itemprop, then class-based, then text scan
  const priceEl =
    ctx.querySelector("[itemprop='price']") ??
    ctx.querySelector("[class*='price']:not([class*='shipping'])") ??
    null;

  if (priceEl) {
    const priceContent = priceEl.getAttribute("content") ?? priceEl.textContent ?? "";
    const match = priceContent.match(/\$?\s*(\d{1,7}(?:[,\s]\d{3})*(?:\.\d{1,2})?)/);
    if (match) {
      const val = parseFloat(match[1].replace(/[,\s]/g, ""));
      if (isFinite(val) && val > 0 && val < 100_000_000) {
        context.cardPrice = val;
      }
    }
  }

  // Link: nearest anchor
  const linkAnchor =
    (img.closest("a[href]") as HTMLAnchorElement | null) ??
    (ctx.querySelector("a[href]") as HTMLAnchorElement | null);
  if (linkAnchor?.href) {
    try {
      const url = new URL(linkAnchor.href, window.location.href);
      if (url.protocol === "https:" || url.protocol === "http:") {
        context.cardLink = url.href;
      }
    } catch {
      // ignore invalid URL
    }
  }

  return context;
}

// ─── Overlay position tracking ────────────────────────────────────────────────

function updateButtonPosition(rect: DOMRect): void {
  if (!shadowBtn) return;
  const top = rect.top + INSET;
  const left = rect.right - BUTTON_SIZE - INSET;
  shadowBtn.style.top = `${top}px`;
  shadowBtn.style.left = `${left}px`;
}

function startRAFTracking(): void {
  if (rafId !== null) return;
  const tick = () => {
    if (!currentImage || !isEnabled) {
      rafId = null;
      return;
    }
    updateButtonPosition(currentImage.getBoundingClientRect());
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function stopRAFTracking(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// ─── Visibility guard (IntersectionObserver) ──────────────────────────────────

function observeCurrentImage(): void {
  if (!intersectionObserver || !currentImage) return;
  intersectionObserver.observe(currentImage);
}

function unobserveCurrentImage(img: HTMLImageElement): void {
  if (!intersectionObserver) return;
  intersectionObserver.unobserve(img);
}

// ─── Button show/hide ─────────────────────────────────────────────────────────

function clearHideTimer(): void {
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function showButton(img: HTMLImageElement): void {
  if (!shadowBtn || !shadowHost) return;
  clearHideTimer();

  if (currentImage && currentImage !== img) {
    unobserveCurrentImage(currentImage);
  }

  currentImage = img;
  updateButtonPosition(img.getBoundingClientRect());
  shadowBtn.style.display = "flex";
  shadowHost.style.display = "block";

  observeCurrentImage();
  startRAFTracking();
}

function scheduleHide(): void {
  clearHideTimer();
  hideTimer = setTimeout(() => {
    hideButtonImmediate();
  }, HIDE_DELAY_MS);
}

function hideButtonImmediate(): void {
  clearHideTimer();
  stopRAFTracking();

  if (currentImage) {
    unobserveCurrentImage(currentImage);
    currentImage = null;
  }

  if (shadowBtn) shadowBtn.style.display = "none";
  if (shadowHost) shadowHost.style.display = "none";
}

// ─── Shadow DOM construction ──────────────────────────────────────────────────

function buildShadowOverlay(): void {
  if (shadowHost) return; // already built

  const host = document.createElement("div");
  host.setAttribute(HOST_ATTR, "1");
  host.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;overflow:visible;" +
    "z-index:2147483647;pointer-events:none;display:none;";

  const shadow = host.attachShadow({ mode: "closed" });

  // Stylesheet inside shadow DOM
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    button {
      position: fixed;
      width: ${BUTTON_SIZE}px;
      height: ${BUTTON_SIZE}px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      background: #ffffff;
      border: none;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.05);
      cursor: pointer;
      pointer-events: auto;
      transition: transform 0.1s ease, box-shadow 0.1s ease;
      outline: none;
      -webkit-font-smoothing: antialiased;
    }
    button:hover {
      transform: scale(1.08);
      box-shadow: 0 4px 16px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.07);
    }
    button:focus-visible {
      outline: 2px solid #B8962E;
      outline-offset: 2px;
    }
    button:active { transform: scale(0.97); }
    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
      user-select: none;
    }
  `;

  const btn = document.createElement("button");
  btn.setAttribute("aria-label", "Pick with BSP");
  btn.setAttribute("title", "Pick with BSP");
  btn.setAttribute("tabindex", "0");
  btn.style.display = "none"; // hidden until first show

  const logoImg = document.createElement("img");
  logoImg.src = logoUrl;
  logoImg.alt = "";
  logoImg.setAttribute("aria-hidden", "true");
  btn.appendChild(logoImg);

  shadow.appendChild(style);
  shadow.appendChild(btn);
  document.body.appendChild(host);

  shadowHost = host;
  shadowBtn = btn;

  // Button mouse events — stay visible when pointer moves onto button
  btn.addEventListener("mouseenter", () => {
    clearHideTimer();
  });
  btn.addEventListener("mouseleave", () => {
    scheduleHide();
  });

  // Keyboard activation
  btn.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (currentImage) {
        handlePickClick(currentImage);
      }
    }
  });

  // Click activation
  btn.addEventListener("click", (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentImage) {
      handlePickClick(currentImage);
    }
  });
}

// ─── Click handler ────────────────────────────────────────────────────────────

function handlePickClick(img: HTMLImageElement): void {
  const imageUrl = img.currentSrc || img.src;
  if (!imageUrl || imageUrl.startsWith("data:") || imageUrl.startsWith("blob:")) return;

  const cardContext = extractCardContext(img);

  const candidate: Omit<PendingCandidate, "timestamp" | "tabId"> = {
    imageUrl,
    altText: img.alt || undefined,
    sourceUrl: window.location.href,
    cardTitle: cardContext.cardTitle,
    cardPrice: cardContext.cardPrice,
    cardLink: cardContext.cardLink,
    // Heuristic: if there's a specific card link that differs from the page URL, it's a list page
    isDetailPage: !cardContext.cardLink || cardContext.cardLink === window.location.href,
  };

  // Immediately send to service worker — it will store the candidate and open the panel
  chrome.runtime.sendMessage(
    { type: "HOVER_IMAGE_CLICKED", candidate },
    () => {
      // Response handled by service worker; ignore here
      if (chrome.runtime.lastError) {
        // Service worker not reachable — candidate couldn't be stored
        console.error("[BSP] Could not send hover candidate:", chrome.runtime.lastError.message);
      }
    }
  );

  // Hide the button after click
  hideButtonImmediate();
}

// ─── Event delegation ─────────────────────────────────────────────────────────

function onDocumentMouseover(e: MouseEvent): void {
  if (!isEnabled) return;

  const img = findEligibleImageFromTarget(e.target);
  if (!img) return;

  if (img === currentImage) {
    clearHideTimer(); // re-entering same image
    return;
  }

  showButton(img);
}

function onDocumentMouseout(e: MouseEvent): void {
  if (!isEnabled || !currentImage) return;
  if (e.target !== currentImage) return;

  const relatedTarget = e.relatedTarget as Element | null;

  // Check if moving to the button itself (shadow DOM — we handle this in btn.mouseenter)
  // or to a child of the image (doesn't happen for img but be safe)
  if (relatedTarget && currentImage.contains(relatedTarget)) return;

  scheduleHide();
}

// ─── MutationObserver for dynamic content ────────────────────────────────────

let mutationDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function onMutation(): void {
  // Debounce: just ensure the hover state is consistent after DOM changes
  if (mutationDebounceTimer !== null) clearTimeout(mutationDebounceTimer);
  mutationDebounceTimer = setTimeout(() => {
    mutationDebounceTimer = null;
    // If the current image is no longer in the DOM, hide the button
    if (currentImage && !document.contains(currentImage)) {
      hideButtonImmediate();
    }
  }, 150);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the hover overlay system.
 * Call once when the content script loads.
 * @param logoSrc chrome.runtime.getURL path for the BSP logo PNG
 */
export function initHoverOverlay(logoSrc: string): void {
  logoUrl = logoSrc;

  // IntersectionObserver: hide button if image scrolls out of view
  intersectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting && entry.target === currentImage) {
          hideButtonImmediate();
          break;
        }
      }
    },
    { threshold: 0.1 }
  );

  // MutationObserver: handle dynamic DOM changes (carousels, lazy loaders, SPA)
  mutationObserver = new MutationObserver(onMutation);
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Build the shadow DOM overlay (will be shown/hidden as needed)
  buildShadowOverlay();

  // Event delegation on document
  document.addEventListener("mouseover", onDocumentMouseover, false);
  document.addEventListener("mouseout", onDocumentMouseout, false);
}

/**
 * Enable hover picking (called when the user enables picking for this origin).
 */
export function enableHover(): void {
  isEnabled = true;
}

/**
 * Disable hover picking (called when the user disables picking for this origin).
 */
export function disableHover(): void {
  isEnabled = false;
  hideButtonImmediate();
}

/**
 * Tear down all hover listeners and observers.
 * Call on SPA navigation or content script unload.
 */
export function destroyHoverOverlay(): void {
  isEnabled = false;
  hideButtonImmediate();

  document.removeEventListener("mouseover", onDocumentMouseover, false);
  document.removeEventListener("mouseout", onDocumentMouseout, false);

  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }

  if (shadowHost) {
    shadowHost.remove();
    shadowHost = null;
    shadowBtn = null;
  }

  if (mutationDebounceTimer !== null) {
    clearTimeout(mutationDebounceTimer);
    mutationDebounceTimer = null;
  }
}

/** Returns true if hover is currently enabled. */
export function isHoverEnabled(): boolean {
  return isEnabled;
}
