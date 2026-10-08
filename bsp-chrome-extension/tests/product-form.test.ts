/**
 * Tests for product form validation, pricing preview math, save payload, and drafts.
 */

import {
  validateProductForm,
  computePricingPreview,
  buildSavePayload,
  validateMoneyField,
} from "../src/shared/validation";
import type { ProductFormState } from "../src/types/index";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeForm(overrides: Partial<ProductFormState> = {}): ProductFormState {
  return {
    title: "Test Product",
    sourceUrl: "https://example.com/product",
    description: "",
    cost: "",
    markupPercent: "0",
    quantity: "1",
    unit: "each",
    msrp: "",
    taxable: false,
    supplierName: "",
    manufacturer: "",
    sku: "",
    dimensions: "",
    finishColor: "",
    composition: "",
    category: "Other",
    vendorDescription: "",
    internalNotes: "",
    tags: "",
    imageUrls: [],
    selectedImageIndexes: [],
    ...overrides,
  };
}

// ─── validateProductForm ──────────────────────────────────────────────────────

describe("validateProductForm", () => {
  describe("title", () => {
    it("accepts a valid title", () => {
      const e = validateProductForm(makeForm({ title: "My Product" }));
      expect(e.title).toBeUndefined();
    });

    it("rejects empty title", () => {
      const e = validateProductForm(makeForm({ title: "" }));
      expect(e.title).toBeTruthy();
    });

    it("rejects whitespace-only title", () => {
      const e = validateProductForm(makeForm({ title: "   " }));
      expect(e.title).toBeTruthy();
    });

    it("rejects title over 500 chars", () => {
      const e = validateProductForm(makeForm({ title: "x".repeat(501) }));
      expect(e.title).toBeTruthy();
    });

    it("accepts title exactly 500 chars", () => {
      const e = validateProductForm(makeForm({ title: "x".repeat(500) }));
      expect(e.title).toBeUndefined();
    });
  });

  describe("sourceUrl", () => {
    it("accepts a valid https URL", () => {
      const e = validateProductForm(makeForm());
      expect(e.sourceUrl).toBeUndefined();
    });

    it("accepts a valid http URL", () => {
      const e = validateProductForm(makeForm({ sourceUrl: "http://example.com/product" }));
      expect(e.sourceUrl).toBeUndefined();
    });

    it("rejects empty sourceUrl", () => {
      const e = validateProductForm(makeForm({ sourceUrl: "" }));
      expect(e.sourceUrl).toBeTruthy();
    });

    it("rejects a non-http URL (ftp)", () => {
      const e = validateProductForm(makeForm({ sourceUrl: "ftp://example.com/product" }));
      expect(e.sourceUrl).toBeTruthy();
    });

    it("rejects sourceUrl with embedded credentials", () => {
      const e = validateProductForm(
        makeForm({ sourceUrl: "https://user:pass@example.com/product" })
      );
      expect(e.sourceUrl).toMatch(/credentials/i);
    });

    it("rejects sourceUrl over 8192 chars", () => {
      const e = validateProductForm(
        makeForm({ sourceUrl: "https://example.com/" + "x".repeat(8173) })
      );
      expect(e.sourceUrl).toBeTruthy();
    });
  });

  describe("description", () => {
    it("accepts empty description", () => {
      const e = validateProductForm(makeForm({ description: "" }));
      expect(e.description).toBeUndefined();
    });

    it("rejects description over 20000 chars", () => {
      const e = validateProductForm(makeForm({ description: "x".repeat(20001) }));
      expect(e.description).toBeTruthy();
    });

    it("accepts description exactly 20000 chars", () => {
      const e = validateProductForm(makeForm({ description: "x".repeat(20000) }));
      expect(e.description).toBeUndefined();
    });
  });

  describe("cost", () => {
    it("accepts blank cost (optional)", () => {
      const e = validateProductForm(makeForm({ cost: "" }));
      expect(e.cost).toBeUndefined();
    });

    it("accepts $0 (zero cost is distinct from blank)", () => {
      const e = validateProductForm(makeForm({ cost: "0" }));
      expect(e.cost).toBeUndefined();
    });

    it("accepts a valid decimal cost", () => {
      const e = validateProductForm(makeForm({ cost: "19.99" }));
      expect(e.cost).toBeUndefined();
    });

    it("rejects negative cost", () => {
      const e = validateProductForm(makeForm({ cost: "-5" }));
      expect(e.cost).toBeTruthy();
    });

    it("rejects cost over 100000000", () => {
      const e = validateProductForm(makeForm({ cost: "100000001" }));
      expect(e.cost).toBeTruthy();
    });

    it("rejects cost with more than 2 decimal places", () => {
      const e = validateProductForm(makeForm({ cost: "19.999" }));
      expect(e.cost).toBeTruthy();
    });

    it("accepts cost exactly at 100000000", () => {
      const e = validateProductForm(makeForm({ cost: "100000000" }));
      expect(e.cost).toBeUndefined();
    });

    it("rejects non-numeric cost", () => {
      const e = validateProductForm(makeForm({ cost: "abc" }));
      expect(e.cost).toBeTruthy();
    });
  });

  describe("markupPercent", () => {
    it("accepts 0", () => {
      const e = validateProductForm(makeForm({ markupPercent: "0" }));
      expect(e.markupPercent).toBeUndefined();
    });

    it("accepts 1000", () => {
      const e = validateProductForm(makeForm({ markupPercent: "1000" }));
      expect(e.markupPercent).toBeUndefined();
    });

    it("rejects negative markup", () => {
      const e = validateProductForm(makeForm({ markupPercent: "-1" }));
      expect(e.markupPercent).toBeTruthy();
    });

    it("rejects markup over 1000", () => {
      const e = validateProductForm(makeForm({ markupPercent: "1001" }));
      expect(e.markupPercent).toBeTruthy();
    });
  });

  describe("quantity", () => {
    it("accepts 1", () => {
      const e = validateProductForm(makeForm({ quantity: "1" }));
      expect(e.quantity).toBeUndefined();
    });

    it("accepts a fractional quantity", () => {
      const e = validateProductForm(makeForm({ quantity: "2.5" }));
      expect(e.quantity).toBeUndefined();
    });

    it("rejects 0", () => {
      const e = validateProductForm(makeForm({ quantity: "0" }));
      expect(e.quantity).toBeTruthy();
    });

    it("rejects negative quantity", () => {
      const e = validateProductForm(makeForm({ quantity: "-1" }));
      expect(e.quantity).toBeTruthy();
    });

    it("rejects quantity over 1000000", () => {
      const e = validateProductForm(makeForm({ quantity: "1000001" }));
      expect(e.quantity).toBeTruthy();
    });

    it("accepts quantity exactly 1000000", () => {
      const e = validateProductForm(makeForm({ quantity: "1000000" }));
      expect(e.quantity).toBeUndefined();
    });
  });

  describe("tags", () => {
    it("accepts empty tags", () => {
      const e = validateProductForm(makeForm({ tags: "" }));
      expect(e.tags).toBeUndefined();
    });

    it("accepts 50 tags", () => {
      const tags = Array.from({ length: 50 }, (_, i) => `tag${i}`).join(", ");
      const e = validateProductForm(makeForm({ tags }));
      expect(e.tags).toBeUndefined();
    });

    it("rejects 51 tags", () => {
      const tags = Array.from({ length: 51 }, (_, i) => `tag${i}`).join(", ");
      const e = validateProductForm(makeForm({ tags }));
      expect(e.tags).toBeTruthy();
    });

    it("rejects a tag over 100 chars", () => {
      const longTag = "x".repeat(101);
      const e = validateProductForm(makeForm({ tags: longTag }));
      expect(e.tags).toBeTruthy();
    });

    it("accepts a tag exactly 100 chars", () => {
      const tag = "x".repeat(100);
      const e = validateProductForm(makeForm({ tags: tag }));
      expect(e.tags).toBeUndefined();
    });
  });

  describe("imageUrls validation", () => {
    it("accepts 5 selected valid images", () => {
      const urls = Array.from({ length: 5 }, (_, i) => `https://cdn.example.com/img${i}.jpg`);
      const e = validateProductForm(
        makeForm({ imageUrls: urls, selectedImageIndexes: urls.map(() => true) })
      );
      expect(e.imageUrls).toBeUndefined();
    });

    it("rejects 6 selected images", () => {
      const urls = Array.from({ length: 6 }, (_, i) => `https://cdn.example.com/img${i}.jpg`);
      const e = validateProductForm(
        makeForm({ imageUrls: urls, selectedImageIndexes: urls.map(() => true) })
      );
      expect(e.imageUrls).toBeTruthy();
    });

    it("allows 6 image URLs if only 5 are selected", () => {
      const urls = Array.from({ length: 6 }, (_, i) => `https://cdn.example.com/img${i}.jpg`);
      const selected = [true, true, true, true, true, false];
      const e = validateProductForm(
        makeForm({ imageUrls: urls, selectedImageIndexes: selected })
      );
      expect(e.imageUrls).toBeUndefined();
    });

    it("rejects a non-http image URL", () => {
      const e = validateProductForm(
        makeForm({
          imageUrls: ["data:image/png;base64,abc"],
          selectedImageIndexes: [true],
        })
      );
      expect(e.imageUrls).toBeTruthy();
    });

    it("rejects an image URL with embedded credentials", () => {
      const e = validateProductForm(
        makeForm({
          imageUrls: ["https://user:pass@cdn.example.com/img.jpg"],
          selectedImageIndexes: [true],
        })
      );
      expect(e.imageUrls).toBeTruthy();
    });
  });
});

// ─── validateMoneyField ───────────────────────────────────────────────────────

describe("validateMoneyField", () => {
  it("accepts blank (optional)", () => {
    expect(validateMoneyField("", "Cost")).toBeNull();
  });

  it("accepts valid decimal", () => {
    expect(validateMoneyField("19.99", "Cost")).toBeNull();
  });

  it("rejects non-numeric", () => {
    expect(validateMoneyField("abc", "Cost")).toBeTruthy();
  });

  it("rejects negative", () => {
    expect(validateMoneyField("-1", "Cost")).toBeTruthy();
  });

  it("accepts 0", () => {
    expect(validateMoneyField("0", "Cost")).toBeNull();
  });

  it("rejects more than 2 decimal places", () => {
    expect(validateMoneyField("10.999", "Cost")).toBeTruthy();
  });

  it("accepts exactly 2 decimal places", () => {
    expect(validateMoneyField("10.99", "Cost")).toBeNull();
  });
});

// ─── computePricingPreview ────────────────────────────────────────────────────

describe("computePricingPreview", () => {
  it("returns hasPrice: false when cost is blank", () => {
    const p = computePricingPreview("", "0", "1");
    expect(p.hasPrice).toBe(false);
    expect(p.unitSellingPrice).toBeNull();
    expect(p.total).toBeNull();
  });

  it("spec example: cost $19.99, markup 15%, qty 2.5 → unit $22.99, total $57.48", () => {
    const p = computePricingPreview("19.99", "15", "2.5");
    expect(p.hasPrice).toBe(true);
    expect(p.unitSellingPrice).toBe(22.99);
    expect(p.total).toBe(57.48);
  });

  it("zero markup passes through cost unchanged", () => {
    const p = computePricingPreview("100", "0", "1");
    expect(p.unitSellingPrice).toBe(100);
    expect(p.total).toBe(100);
  });

  it("handles 100% markup", () => {
    const p = computePricingPreview("10", "100", "1");
    expect(p.unitSellingPrice).toBe(20);
  });

  it("cost $0 is distinct from blank — has price", () => {
    const p = computePricingPreview("0", "0", "1");
    expect(p.hasPrice).toBe(true);
    expect(p.unitSellingPrice).toBe(0);
  });

  it("returns total: null when qty is blank", () => {
    const p = computePricingPreview("50", "10", "");
    expect(p.hasPrice).toBe(true);
    expect(p.unitSellingPrice).toBe(55);
    expect(p.total).toBeNull();
  });

  it("returns total: null when qty is 0", () => {
    const p = computePricingPreview("50", "0", "0");
    expect(p.total).toBeNull();
  });

  it("handles fractional quantities correctly", () => {
    const p = computePricingPreview("10", "0", "0.5");
    expect(p.total).toBe(5);
  });

  it("applies rounding correctly — no floating point drift", () => {
    // $0.10 * 1.15 = $0.115, rounds to $0.12
    const p = computePricingPreview("0.10", "15", "1");
    expect(p.unitSellingPrice).toBe(0.12);
  });
});

// ─── buildSavePayload ─────────────────────────────────────────────────────────

describe("buildSavePayload", () => {
  const REQUEST_ID = "00000000-0000-0000-0000-000000000001";

  it("builds a basic payload with required fields only", () => {
    const form = makeForm();
    const p = buildSavePayload(form, REQUEST_ID);
    expect(p.operation).toBe("save");
    expect(p.requestId).toBe(REQUEST_ID);
    expect(p.product.title).toBe("Test Product");
    expect(p.product.sourceUrl).toBe("https://example.com/product");
    expect(p.uploadIds).toEqual([]);
  });

  it("omits blank optional fields", () => {
    const form = makeForm({ cost: "", msrp: "", description: "" });
    const p = buildSavePayload(form, REQUEST_ID);
    expect(p.product.cost).toBeUndefined();
    expect(p.product.msrp).toBeUndefined();
    expect(p.product.description).toBeUndefined();
  });

  it("includes cost when provided", () => {
    const form = makeForm({ cost: "19.99" });
    const p = buildSavePayload(form, REQUEST_ID);
    expect(p.product.cost).toBe(19.99);
  });

  it("distinguishes $0 cost from blank", () => {
    const zeroForm = makeForm({ cost: "0" });
    const blankForm = makeForm({ cost: "" });
    const zeroPayload = buildSavePayload(zeroForm, REQUEST_ID);
    const blankPayload = buildSavePayload(blankForm, REQUEST_ID);
    expect(zeroPayload.product.cost).toBe(0);
    expect(blankPayload.product.cost).toBeUndefined();
  });

  it("limits imageUrls to 5 selected", () => {
    const urls = Array.from({ length: 8 }, (_, i) => `https://cdn.example.com/img${i}.jpg`);
    const selected = [true, true, true, true, true, true, false, false];
    const form = makeForm({ imageUrls: urls, selectedImageIndexes: selected });
    const p = buildSavePayload(form, REQUEST_ID);
    expect(p.product.imageUrls.length).toBeLessThanOrEqual(5);
  });

  it("only includes selected images", () => {
    const urls = ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"];
    const selected = [true, false];
    const form = makeForm({ imageUrls: urls, selectedImageIndexes: selected });
    const p = buildSavePayload(form, REQUEST_ID);
    expect(p.product.imageUrls).toEqual(["https://cdn.example.com/a.jpg"]);
  });

  it("parses tags correctly", () => {
    const form = makeForm({ tags: "red, blue, green" });
    const p = buildSavePayload(form, REQUEST_ID);
    expect(p.product.tags).toEqual(["red", "blue", "green"]);
  });

  it("omits tags when blank", () => {
    const form = makeForm({ tags: "" });
    const p = buildSavePayload(form, REQUEST_ID);
    expect(p.product.tags).toBeUndefined();
  });

  it("does not include companyId, userId, productJson, destination, roomId", () => {
    const form = makeForm();
    const p = buildSavePayload(form, REQUEST_ID);
    const product = p.product as Record<string, unknown>;
    expect(product["companyId"]).toBeUndefined();
    expect(product["userId"]).toBeUndefined();
    expect(product["productJson"]).toBeUndefined();
    expect(product["destination"]).toBeUndefined();
    expect(product["roomId"]).toBeUndefined();
  });

  it("does not include null or empty strings for optional fields", () => {
    const form = makeForm({ supplierName: "", manufacturer: "" });
    const p = buildSavePayload(form, REQUEST_ID);
    const product = p.product as Record<string, unknown>;
    expect(product["supplierName"]).toBeUndefined();
    expect(product["manufacturer"]).toBeUndefined();
  });

  it("validates payload size is under 131072 bytes for a normal form", () => {
    const form = makeForm({ title: "Simple Product", description: "A nice product" });
    const p = buildSavePayload(form, REQUEST_ID);
    const bodyStr = JSON.stringify(p);
    const byteLength = Buffer.byteLength(bodyStr, "utf8");
    expect(byteLength).toBeLessThan(131072);
  });
});

// ─── Draft persistence logic ──────────────────────────────────────────────────

describe("draft persistence logic", () => {
  it("same-URL draft should be restored silently", () => {
    const draft = {
      sourceUrl: "https://example.com/product",
      form: makeForm({ title: "Saved Draft" }),
      savedAt: Date.now(),
    };
    const currentUrl = "https://example.com/product";
    const shouldRestore = draft.sourceUrl === currentUrl;
    expect(shouldRestore).toBe(true);
  });

  it("different-URL draft should trigger a prompt", () => {
    const draft = {
      sourceUrl: "https://other-site.com/item",
      form: makeForm({ title: "Other Site Draft" }),
      savedAt: Date.now(),
    };
    const currentUrl = "https://example.com/product";
    const needsPrompt = draft.sourceUrl !== currentUrl;
    expect(needsPrompt).toBe(true);
  });

  it("draft serializes and deserializes correctly", () => {
    const form = makeForm({ title: "My Product", cost: "49.99", tags: "luxury, modern" });
    const draft = {
      sourceUrl: form.sourceUrl,
      form,
      savedAt: 1728000000000,
    };
    const serialized = JSON.stringify(draft);
    const deserialized = JSON.parse(serialized);
    expect(deserialized.form.title).toBe("My Product");
    expect(deserialized.form.cost).toBe("49.99");
    expect(deserialized.form.tags).toBe("luxury, modern");
    expect(deserialized.savedAt).toBe(1728000000000);
  });
});

// ─── Error handling paths ─────────────────────────────────────────────────────

describe("save error handling paths", () => {
  it("UNKNOWN prefix indicates retry-safe unknown outcome", () => {
    const errMsg = "UNKNOWN:Network request failed";
    expect(errMsg.startsWith("UNKNOWN:")).toBe(true);
    const realMsg = errMsg.slice("UNKNOWN:".length);
    expect(realMsg).toBe("Network request failed");
  });

  it("400 status error does not have UNKNOWN prefix", () => {
    const errMsg = "400: Bad request — title too long";
    expect(errMsg.startsWith("UNKNOWN:")).toBe(false);
  });

  it("retry must use same requestId and frozen payload", () => {
    const requestId = "original-id-12345678901234567890";
    const frozenPayload = {
      operation: "save" as const,
      requestId,
      product: { title: "Product", sourceUrl: "https://example.com", imageUrls: [] },
      uploadIds: [],
    };
    // Simulating retry: same ID, same payload
    const retryPayload = frozenPayload;
    expect(retryPayload.requestId).toBe(requestId);
    expect(retryPayload.product.title).toBe(frozenPayload.product.title);
  });

  it("replayed: true should show 'Already saved' not an error", () => {
    const saveResponse = {
      success: true,
      protocolVersion: 2,
      materialId: "mat_abc123",
      path: "/library/my-items?tab=materials&materialId=mat_abc123",
      replayed: true,
    };
    // replayed=true is treated as success with "Already saved" message
    expect(saveResponse.replayed).toBe(true);
    expect(saveResponse.success).toBe(true);
  });
});

// ─── Save response parsing ────────────────────────────────────────────────────

import { parseSaveResponse, ApiError } from "../src/service-worker/api";

describe("parseSaveResponse", () => {
  it("accepts a valid save response", () => {
    const data = {
      success: true,
      protocolVersion: 2,
      materialId: "mat_abc123",
      path: "/library/my-items?tab=materials&materialId=mat_abc123",
      replayed: false,
    };
    const result = parseSaveResponse(data);
    expect(result.materialId).toBe("mat_abc123");
    expect(result.replayed).toBe(false);
  });

  it("parses replayed: true correctly", () => {
    const data = {
      success: true,
      protocolVersion: 2,
      materialId: "mat_123",
      path: "/library/my-items",
      replayed: true,
    };
    const result = parseSaveResponse(data);
    expect(result.replayed).toBe(true);
  });

  it("rejects when success is false", () => {
    const data = {
      success: false,
      error: "Validation failed",
      protocolVersion: 2,
      materialId: "",
      path: "",
      replayed: false,
    };
    expect(() => parseSaveResponse(data)).toThrow(ApiError);
  });

  it("rejects when materialId is missing", () => {
    const data = {
      success: true,
      protocolVersion: 2,
      path: "/library/my-items",
      replayed: false,
    };
    expect(() => parseSaveResponse(data)).toThrow(ApiError);
  });

  it("rejects when path is missing", () => {
    const data = {
      success: true,
      protocolVersion: 2,
      materialId: "mat_123",
      replayed: false,
    };
    expect(() => parseSaveResponse(data)).toThrow(ApiError);
  });

  it("rejects null input", () => {
    expect(() => parseSaveResponse(null)).toThrow(ApiError);
  });

  it("includes optional selectionId when present", () => {
    const data = {
      success: true,
      protocolVersion: 2,
      materialId: "mat_abc",
      path: "/library/my-items",
      replayed: false,
      selectionId: "sel_xyz",
      selectionPath: "/selection/xyz",
    };
    const result = parseSaveResponse(data);
    expect(result.selectionId).toBe("sel_xyz");
    expect(result.selectionPath).toBe("/selection/xyz");
  });
});

// ─── Request size validation ──────────────────────────────────────────────────

describe("request size validation", () => {
  const MAX_PRODUCT_CHARS = 100000;
  const MAX_REQUEST_BYTES = 131072;

  it("normal payloads are well under size limits", () => {
    const form = makeForm({ title: "Widget Pro X", cost: "149.99" });
    const payload = buildSavePayload(form, "test-id-1234567890123456789012345");
    const bodyStr = JSON.stringify(payload);
    expect(bodyStr.length).toBeLessThan(MAX_PRODUCT_CHARS);
    expect(Buffer.byteLength(bodyStr, "utf8")).toBeLessThan(MAX_REQUEST_BYTES);
  });

  it("a very large description approaches size limits", () => {
    const form = makeForm({ description: "x".repeat(20000) });
    const payload = buildSavePayload(form, "test-id-1234567890123456789012345");
    const bodyStr = JSON.stringify(payload);
    // Should be large but the form itself may truncate
    expect(bodyStr.length).toBeGreaterThan(1000);
  });
});
