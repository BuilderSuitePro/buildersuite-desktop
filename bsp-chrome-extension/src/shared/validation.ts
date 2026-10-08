/**
 * Settings validation – safe to import in both the side panel and service worker.
 * Contains NO storage access or chrome API calls; pure functions only.
 */

import type { BspSettings, ValidationResult } from "../types/index.js";

const EMBEDDED_CREDENTIALS_RE = /\/\/[^/@]+:[^/@]+@/;

function isValidHttpsUrl(raw: string): boolean {
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
  if (!isValidHttpsUrl(raw)) return false;
  if (hasEmbeddedCredentials(raw)) return false;
  try {
    const url = new URL(raw);
    // An origin has no path beyond "/" and no search/hash
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
  } else if (!isValidHttpsUrl(verUrl)) {
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
  } else if (!isValidHttpsUrl(prodUrl)) {
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
