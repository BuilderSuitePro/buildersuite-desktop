/**
 * Settings validation – safe to import in both the side panel and service worker.
 * Contains NO storage access or chrome API calls; pure functions only.
 */

import type { BspSettings, ValidationResult, ProductFormState } from "../types/index.js";

const EMBEDDED_CREDENTIALS_RE = /\/\/[^/@]+:[^/@]+@/;

function isStrictHttpsUrl(raw: string): boolean {
  if (!raw.trim()) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function hasEmbeddedCredentials(raw: string): boolean {
  return EMBEDDED_CREDENTIALS_RE.test(raw);
}

function isValidHttpsOrigin(raw: string): boolean {
  if (!isStrictHttpsUrl(raw)) return false;
  if (hasEmbeddedCredentials(raw)) return false;
  try {
    const url = new URL(raw);
    return (
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

export function validateSettings(settings: Partial<BspSettings>): ValidationResult {
  const errors: Partial<Record<keyof BspSettings, string>> = {};

  // BSP Web App Origin
  const origin = (settings.bspOrigin ?? "").trim();
  if (!origin) {
    errors.bspOrigin = "BSP Web App Origin is required";
  } else if (hasEmbeddedCredentials(origin)) {
    errors.bspOrigin = "URL must not contain embedded credentials (user:pass@host)";
  } else if (!isValidHttpsOrigin(origin)) {
    errors.bspOrigin =
      "Must be a valid HTTPS origin with no path, e.g. https://app.buildersuitepro.com";
  }

  // Verification URL
  const verUrl = (settings.verificationUrl ?? "").trim();
  if (!verUrl) {
    errors.verificationUrl = "Verification URL is required";
  } else if (hasEmbeddedCredentials(verUrl)) {
    errors.verificationUrl =
      "URL must not contain embedded credentials (user:pass@host)";
  } else if (!isStrictHttpsUrl(verUrl)) {
    errors.verificationUrl = "Must be a valid HTTPS URL";
  } else {
    try {
      const url = new URL(verUrl);
      if (!url.pathname.endsWith("/clipper/verify")) {
        errors.verificationUrl = 'URL path must end with "/clipper/verify"';
      }
    } catch {
      errors.verificationUrl = "Must be a valid HTTPS URL";
    }
  }

  // v2 Product URL
  const prodUrl = (settings.productUrl ?? "").trim();
  if (!prodUrl) {
    errors.productUrl = "v2 Product URL is required";
  } else if (hasEmbeddedCredentials(prodUrl)) {
    errors.productUrl =
      "URL must not contain embedded credentials (user:pass@host)";
  } else if (!isStrictHttpsUrl(prodUrl)) {
    errors.productUrl = "Must be a valid HTTPS URL";
  } else {
    try {
      const url = new URL(prodUrl);
      if (!url.pathname.endsWith("/clipper/v2/products")) {
        errors.productUrl = 'URL path must end with "/clipper/v2/products"';
      }
    } catch {
      errors.productUrl = "Must be a valid HTTPS URL";
    }
  }

  // Connection Key
  const key = (settings.connectionKey ?? "").trim();
  if (!key) {
    errors.connectionKey = "Connection Key is required";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ─── Product Form Validation ──────────────────────────────────────────────────

export interface ProductFormErrors {
  title?: string;
  sourceUrl?: string;
  description?: string;
  category?: string;
  cost?: string;
  msrp?: string;
  markupPercent?: string;
  quantity?: string;
  unit?: string;
  tags?: string;
  imageUrls?: string;
}

/** Validate a monetary string value (USD). Returns null if valid, error string if not. */
export function validateMoneyField(raw: string, label: string): string | null {
  if (!raw.trim()) return null; // optional – blank is OK

  const val = parseFloat(raw);
  if (!isFinite(val)) return `${label} must be a number`;
  if (val < 0) return `${label} must be ≥ 0`;
  if (val > 100000000) return `${label} must be ≤ 100,000,000`;

  // Allow at most 2 decimal places
  const parts = raw.trim().split(".");
  if (parts.length > 1 && parts[1].length > 2) {
    return `${label} may have at most 2 decimal places`;
  }

  return null;
}

function isAbsoluteHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateProductForm(form: ProductFormState): ProductFormErrors {
  const errors: ProductFormErrors = {};

  // Title – required, 1–500
  if (!form.title.trim()) {
    errors.title = "Title is required";
  } else if (form.title.length > 500) {
    errors.title = "Title must be 500 characters or less";
  }

  // Source URL – required, absolute http(s), max 8192, no credentials
  if (!form.sourceUrl.trim()) {
    errors.sourceUrl = "Source URL is required";
  } else if (form.sourceUrl.length > 8192) {
    errors.sourceUrl = "Source URL must be 8192 characters or less";
  } else if (hasEmbeddedCredentials(form.sourceUrl)) {
    errors.sourceUrl = "URL must not contain embedded credentials";
  } else if (!isAbsoluteHttpUrl(form.sourceUrl)) {
    errors.sourceUrl = "Source URL must be an absolute http(s) URL";
  }

  // Description – max 20000
  if (form.description.length > 20000) {
    errors.description = "Description must be 20000 characters or less";
  }

  // Category – max 500
  if (form.category.length > 500) {
    errors.category = "Category must be 500 characters or less";
  }

  // Cost
  const costErr = validateMoneyField(form.cost, "Cost");
  if (costErr) errors.cost = costErr;

  // MSRP
  const msrpErr = validateMoneyField(form.msrp, "MSRP");
  if (msrpErr) errors.msrp = msrpErr;

  // Markup %
  const markupVal = parseFloat(form.markupPercent);
  if (form.markupPercent.trim() !== "") {
    if (!isFinite(markupVal) || markupVal < 0 || markupVal > 1000) {
      errors.markupPercent = "Markup must be 0–1000%";
    }
  }

  // Quantity
  const qtyVal = parseFloat(form.quantity);
  if (!form.quantity.trim()) {
    errors.quantity = "Quantity is required";
  } else if (!isFinite(qtyVal) || qtyVal <= 0 || qtyVal > 1000000) {
    errors.quantity = "Quantity must be > 0 and ≤ 1,000,000";
  }

  // Unit – max 500
  if (form.unit.length > 500) {
    errors.unit = "Unit must be 500 characters or less";
  }

  // Tags
  if (form.tags.trim()) {
    const tagList = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tagList.length > 50) {
      errors.tags = "Maximum 50 tags allowed";
    } else {
      const tooLong = tagList.find((t) => t.length > 100);
      if (tooLong) {
        errors.tags = `Tag "${tooLong.slice(0, 20)}..." exceeds 100 characters`;
      }
    }
  }

  // Image URLs – validate selected ones
  const selectedUrls = form.imageUrls.filter(
    (_, i) => form.selectedImageIndexes[i]
  );
  if (selectedUrls.length > 5) {
    errors.imageUrls = "At most 5 images may be included";
  } else {
    for (const url of selectedUrls) {
      if (url.length > 8192) {
        errors.imageUrls = "An image URL exceeds 8192 characters";
        break;
      }
      if (hasEmbeddedCredentials(url)) {
        errors.imageUrls = "Image URLs must not contain embedded credentials";
        break;
      }
      if (!isAbsoluteHttpUrl(url)) {
        errors.imageUrls = "All image URLs must be absolute http(s) URLs";
        break;
      }
    }
  }

  return errors;
}

// ─── Pricing Preview ──────────────────────────────────────────────────────────

export interface PricingPreview {
  unitSellingPrice: number | null;
  total: number | null;
  hasPrice: boolean;
}

/**
 * Compute the pricing preview from form values.
 *
 * - cost: blank → no price; otherwise USD cents rounded to 2 decimal places
 * - unitSelling = round(costCents × (1 + markupPercent/100)) / 100
 * - total = round(unitSellingCents × quantity) / 100
 *
 * Example: cost $19.99, markup 15%, qty 2.5 → unit $22.99, total $57.48
 */
export function computePricingPreview(
  costStr: string,
  markupStr: string,
  qtyStr: string
): PricingPreview {
  const cost = parseFloat(costStr);
  const markup = parseFloat(markupStr);
  const qty = parseFloat(qtyStr);

  if (!costStr.trim() || !isFinite(cost)) {
    return { unitSellingPrice: null, total: null, hasPrice: false };
  }

  const costCents = Math.round(cost * 100);
  const markupFactor = 1 + (isFinite(markup) ? markup : 0) / 100;
  const unitSellingCents = Math.round(costCents * markupFactor);
  const unitSellingPrice = unitSellingCents / 100;

  if (!isFinite(qty) || qty <= 0) {
    return { unitSellingPrice, total: null, hasPrice: true };
  }

  const totalCents = Math.round(unitSellingCents * qty);
  const total = totalCents / 100;

  return { unitSellingPrice, total, hasPrice: true };
}

// ─── Save Payload Builder ─────────────────────────────────────────────────────

import type { ProductSavePayload } from "../types/index.js";

/** Build the save payload from form state. Omits blank optional fields. */
export function buildSavePayload(
  form: ProductFormState,
  requestId: string
): ProductSavePayload {
  const selectedImageUrls = form.imageUrls
    .filter((_, i) => form.selectedImageIndexes[i])
    .filter((url) => {
      try {
        const u = new URL(url);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    })
    .slice(0, 5);

  const product: ProductSavePayload["product"] = {
    title: form.title.trim(),
    sourceUrl: form.sourceUrl.trim(),
    imageUrls: selectedImageUrls,
  };

  const cost = parseFloat(form.cost);
  if (form.cost.trim() && isFinite(cost)) {
    product.cost = Math.round(cost * 100) / 100;
  }

  const msrp = parseFloat(form.msrp);
  if (form.msrp.trim() && isFinite(msrp)) {
    product.msrp = Math.round(msrp * 100) / 100;
  }

  if (form.description.trim()) product.description = form.description.trim();
  if (form.category.trim()) product.category = form.category.trim();
  if (form.supplierName.trim()) product.supplierName = form.supplierName.trim();
  if (form.manufacturer.trim()) product.manufacturer = form.manufacturer.trim();
  if (form.sku.trim()) product.sku = form.sku.trim();
  if (form.dimensions.trim()) product.dimensions = form.dimensions.trim();
  if (form.finishColor.trim()) product.finishColor = form.finishColor.trim();
  if (form.composition.trim()) product.composition = form.composition.trim();
  if (form.vendorDescription.trim())
    product.vendorDescription = form.vendorDescription.trim();
  if (form.internalNotes.trim())
    product.internalNotes = form.internalNotes.trim();

  const markup = parseFloat(form.markupPercent);
  if (form.markupPercent.trim() && isFinite(markup)) {
    product.markupPercent = markup;
  }

  const qty = parseFloat(form.quantity);
  if (form.quantity.trim() && isFinite(qty) && qty > 0) {
    product.quantity = qty;
  }

  if (form.unit.trim()) product.unit = form.unit.trim();
  if (form.taxable) product.taxable = true;

  if (form.tags.trim()) {
    const tagList = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && t.length <= 100)
      .slice(0, 50);
    if (tagList.length > 0) product.tags = tagList;
  }

  return {
    operation: "save",
    requestId,
    product,
    uploadIds: [],
  };
}
