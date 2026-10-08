/**
 * Tests for settings validation logic.
 */

import { validateSettings } from "../src/shared/validation";
import type { BspSettings } from "../src/types/index";

const VALID: BspSettings = {
  bspOrigin: "https://app.buildersuitepro.com",
  verificationUrl: "https://api.buildersuitepro.com/clipper/verify",
  productUrl: "https://api.buildersuitepro.com/clipper/v2/products",
  connectionKey: "secret-key-abc123",
};

describe("validateSettings", () => {
  // ── Happy path ──────────────────────────────────────────────────────────

  it("accepts a fully valid settings object", () => {
    const result = validateSettings(VALID);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  // ── bspOrigin ───────────────────────────────────────────────────────────

  it("rejects missing bspOrigin", () => {
    const r = validateSettings({ ...VALID, bspOrigin: "" });
    expect(r.valid).toBe(false);
    expect(r.errors.bspOrigin).toBeTruthy();
  });

  it("rejects http:// bspOrigin", () => {
    const r = validateSettings({ ...VALID, bspOrigin: "http://app.buildersuitepro.com" });
    expect(r.valid).toBe(false);
    expect(r.errors.bspOrigin).toMatch(/https/i);
  });

  it("rejects bspOrigin with a path", () => {
    const r = validateSettings({ ...VALID, bspOrigin: "https://app.buildersuitepro.com/some/path" });
    expect(r.valid).toBe(false);
    expect(r.errors.bspOrigin).toBeTruthy();
  });

  it("rejects bspOrigin with embedded credentials", () => {
    const r = validateSettings({ ...VALID, bspOrigin: "https://user:pass@app.buildersuitepro.com" });
    expect(r.valid).toBe(false);
    expect(r.errors.bspOrigin).toMatch(/credentials/i);
  });

  it("rejects bspOrigin with query string", () => {
    const r = validateSettings({ ...VALID, bspOrigin: "https://app.buildersuitepro.com?foo=bar" });
    expect(r.valid).toBe(false);
    expect(r.errors.bspOrigin).toBeTruthy();
  });

  // ── verificationUrl ─────────────────────────────────────────────────────

  it("rejects missing verificationUrl", () => {
    const r = validateSettings({ ...VALID, verificationUrl: "" });
    expect(r.valid).toBe(false);
    expect(r.errors.verificationUrl).toBeTruthy();
  });

  it("rejects http:// verificationUrl", () => {
    const r = validateSettings({ ...VALID, verificationUrl: "http://api.buildersuitepro.com/clipper/verify" });
    expect(r.valid).toBe(false);
    expect(r.errors.verificationUrl).toMatch(/https/i);
  });

  it("rejects verificationUrl whose path does not end with /clipper/verify", () => {
    const r = validateSettings({ ...VALID, verificationUrl: "https://api.buildersuitepro.com/clipper/save" });
    expect(r.valid).toBe(false);
    expect(r.errors.verificationUrl).toMatch(/clipper\/verify/);
  });

  it("accepts verificationUrl with query params as long as path ends correctly", () => {
    const r = validateSettings({ ...VALID, verificationUrl: "https://api.buildersuitepro.com/clipper/verify?token=abc" });
    expect(r.valid).toBe(true);
  });

  it("rejects verificationUrl with embedded credentials", () => {
    const r = validateSettings({ ...VALID, verificationUrl: "https://user:pass@api.buildersuitepro.com/clipper/verify" });
    expect(r.valid).toBe(false);
    expect(r.errors.verificationUrl).toMatch(/credentials/i);
  });

  // ── productUrl ──────────────────────────────────────────────────────────

  it("rejects missing productUrl", () => {
    const r = validateSettings({ ...VALID, productUrl: "" });
    expect(r.valid).toBe(false);
    expect(r.errors.productUrl).toBeTruthy();
  });

  it("rejects http:// productUrl", () => {
    const r = validateSettings({ ...VALID, productUrl: "http://api.buildersuitepro.com/clipper/v2/products" });
    expect(r.valid).toBe(false);
    expect(r.errors.productUrl).toMatch(/https/i);
  });

  it("rejects productUrl whose path does not end with /clipper/v2/products", () => {
    const r = validateSettings({ ...VALID, productUrl: "https://api.buildersuitepro.com/clipper/v1/products" });
    expect(r.valid).toBe(false);
    expect(r.errors.productUrl).toMatch(/clipper\/v2\/products/);
  });

  it("rejects productUrl with embedded credentials", () => {
    const r = validateSettings({ ...VALID, productUrl: "https://user:pass@api.buildersuitepro.com/clipper/v2/products" });
    expect(r.valid).toBe(false);
    expect(r.errors.productUrl).toMatch(/credentials/i);
  });

  // ── connectionKey ───────────────────────────────────────────────────────

  it("rejects empty connectionKey", () => {
    const r = validateSettings({ ...VALID, connectionKey: "" });
    expect(r.valid).toBe(false);
    expect(r.errors.connectionKey).toBeTruthy();
  });

  it("rejects whitespace-only connectionKey", () => {
    const r = validateSettings({ ...VALID, connectionKey: "   " });
    expect(r.valid).toBe(false);
    expect(r.errors.connectionKey).toBeTruthy();
  });

  // ── clearVerificationOnChange ───────────────────────────────────────────

  it("returns distinct error objects per field independently", () => {
    const r1 = validateSettings({ ...VALID, connectionKey: "" });
    const r2 = validateSettings({ ...VALID, bspOrigin: "" });
    expect(r1.errors.connectionKey).toBeTruthy();
    expect(r1.errors.bspOrigin).toBeUndefined();
    expect(r2.errors.bspOrigin).toBeTruthy();
    expect(r2.errors.connectionKey).toBeUndefined();
  });

  it("rejects partial settings (all empty)", () => {
    const r = validateSettings({});
    expect(r.valid).toBe(false);
    expect(Object.keys(r.errors).length).toBeGreaterThan(0);
  });
});
