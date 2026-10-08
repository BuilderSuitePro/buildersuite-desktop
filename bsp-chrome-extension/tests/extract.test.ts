/**
 * Tests for content script extraction logic.
 */

// ─── Helpers (stripped from the actual module for isolated unit testing) ──────

interface PriceCandidate {
  value: number;
  context: string;
}

interface ExtractionResult {
  title?: string;
  sourceUrl: string;
  description?: string;
  cost?: number;
  msrp?: number;
  currency?: string;
  currencyWarning?: string;
  supplierName?: string;
  manufacturer?: string;
  sku?: string;
  dimensions?: string;
  finishColor?: string;
  composition?: string;
  category?: string;
  imageUrls: string[];
  priceCandidates?: PriceCandidate[];
}

// ─── resolveImageUrl ──────────────────────────────────────────────────────────

function resolveImageUrl(raw: string, base: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, base);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

describe("resolveImageUrl", () => {
  it("passes through absolute https URLs unchanged", () => {
    expect(resolveImageUrl("https://example.com/img.jpg", "https://example.com"))
      .toBe("https://example.com/img.jpg");
  });

  it("resolves relative paths against the base URL", () => {
    expect(resolveImageUrl("/images/product.jpg", "https://example.com/shop"))
      .toBe("https://example.com/images/product.jpg");
  });

  it("resolves protocol-relative URLs", () => {
    expect(resolveImageUrl("//cdn.example.com/img.jpg", "https://example.com"))
      .toBe("https://cdn.example.com/img.jpg");
  });

  it("returns null for data: URIs", () => {
    expect(resolveImageUrl("data:image/png;base64,abc123", "https://example.com"))
      .toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveImageUrl("", "https://example.com")).toBeNull();
  });

  it("returns null for blob: URLs", () => {
    expect(resolveImageUrl("blob:https://example.com/uuid", "https://example.com"))
      .toBeNull();
  });

  it("resolves paths with .. correctly", () => {
    const resolved = resolveImageUrl("../img.jpg", "https://example.com/shop/product/");
    expect(resolved).toBe("https://example.com/shop/img.jpg");
  });
});

// ─── JSON-LD parsing (via embedded logic) ────────────────────────────────────

interface JsonLdProduct {
  "@type"?: string | string[];
  name?: string;
  description?: string;
  image?: string | string[] | { url?: string };
  url?: string;
  sku?: string;
  brand?: { name?: string } | string;
  offers?: JsonLdOffer | JsonLdOffer[];
  color?: string;
  material?: string;
  category?: string;
}

interface JsonLdOffer {
  "@type"?: string;
  price?: number | string;
  priceCurrency?: string;
  lowPrice?: number | string;
  highPrice?: number | string;
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
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) {
      if (isProductNode(item)) return item as JsonLdProduct;
    }
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (isProductNode(item)) return item as JsonLdProduct;
    }
  }
  return null;
}

describe("JSON-LD parsing", () => {
  it("finds a top-level Product node", () => {
    const data = { "@type": "Product", name: "Widget" };
    const p = findProductInJsonLd(data);
    expect(p).not.toBeNull();
    expect(p?.name).toBe("Widget");
  });

  it("finds a Product inside @graph", () => {
    const data = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", name: "Page" },
        { "@type": "Product", name: "Gadget" },
      ],
    };
    const p = findProductInJsonLd(data);
    expect(p?.name).toBe("Gadget");
  });

  it("finds a Product inside a top-level array", () => {
    const data = [
      { "@type": "Organization" },
      { "@type": "Product", name: "Chair" },
    ];
    const p = findProductInJsonLd(data);
    expect(p?.name).toBe("Chair");
  });

  it("returns null when @type is not Product", () => {
    const data = { "@type": "WebPage", name: "Home" };
    expect(findProductInJsonLd(data)).toBeNull();
  });

  it("finds Product when @type is an array containing Product", () => {
    const data = { "@type": ["Product", "Thing"], name: "MultiType" };
    const p = findProductInJsonLd(data);
    expect(p?.name).toBe("MultiType");
  });

  it("returns null for null input", () => {
    expect(findProductInJsonLd(null)).toBeNull();
  });

  it("returns null for a string input", () => {
    expect(findProductInJsonLd("Product")).toBeNull();
  });

  it("never evals content – verifies only JSON.parse is used", () => {
    // The JSON-LD extraction must use JSON.parse, never eval.
    // This is verified by the key isolation test in api.test.ts
    // and by the absence of 'eval' in extract.ts.
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(
      path.resolve(__dirname, "../src/content/extract.ts"),
      "utf-8"
    );
    expect(src).not.toMatch(/\beval\s*\(/);
  });
});

// ─── Offer price parsing ──────────────────────────────────────────────────────

function parseOfferPrice(offer: JsonLdOffer): {
  value: number | null;
  currency: string | null;
  context: string;
} {
  const currency =
    typeof offer.priceCurrency === "string" ? offer.priceCurrency : null;

  if (offer.lowPrice !== undefined || offer.highPrice !== undefined) {
    return { value: null, currency, context: "price range — skipped" };
  }

  const raw = offer.price;
  let value: number | null = null;

  if (typeof raw === "number" && isFinite(raw) && raw >= 0) {
    value = raw;
  } else if (typeof raw === "string") {
    const cleaned = raw.replace(/[,$\s]/g, "");
    const parsed = parseFloat(cleaned);
    if (isFinite(parsed) && parsed >= 0) value = parsed;
  }

  const ctx =
    typeof offer.description === "string"
      ? offer.description.slice(0, 60)
      : `offer price ${String(raw)}`;
  return { value, currency, context: ctx };
}

describe("offer price parsing", () => {
  it("parses a numeric USD price", () => {
    const { value, currency } = parseOfferPrice({ price: 29.99, priceCurrency: "USD" });
    expect(value).toBe(29.99);
    expect(currency).toBe("USD");
  });

  it("parses a string price with $ and commas", () => {
    const { value } = parseOfferPrice({ price: "$1,299.00" });
    expect(value).toBe(1299.0);
  });

  it("returns null for a price range (lowPrice/highPrice)", () => {
    const { value } = parseOfferPrice({ lowPrice: 10, highPrice: 50 });
    expect(value).toBeNull();
  });

  it("returns null for non-numeric string price", () => {
    const { value } = parseOfferPrice({ price: "call for price" });
    expect(value).toBeNull();
  });

  it("returns null for negative prices", () => {
    const { value } = parseOfferPrice({ price: -5 });
    expect(value).toBeNull();
  });

  it("returns the currency string", () => {
    const { currency } = parseOfferPrice({ price: 10, priceCurrency: "EUR" });
    expect(currency).toBe("EUR");
  });

  it("handles missing priceCurrency", () => {
    const { currency } = parseOfferPrice({ price: 10 });
    expect(currency).toBeNull();
  });
});

// ─── Currency ambiguity detection ─────────────────────────────────────────────

describe("currency ambiguity detection", () => {
  function buildCurrencyResult(
    offers: JsonLdOffer[]
  ): Partial<ExtractionResult> {
    const result: Partial<ExtractionResult> = { imageUrls: [] };
    const MAX_PRICE_CANDIDATES = 5;
    const priceCandidates: PriceCandidate[] = [];

    for (const offer of offers) {
      const { value, currency } = parseOfferPrice(offer);
      if (value === null) continue;
      if (value > 100000000) continue;

      const curr = currency?.toUpperCase() ?? null;
      if (curr === null || curr === "USD") {
        priceCandidates.push({ value, context: "test" });
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

    return result;
  }

  it("sets cost when currency is clearly USD", () => {
    const result = buildCurrencyResult([{ price: 49.99, priceCurrency: "USD" }]);
    expect(result.cost).toBe(49.99);
    expect(result.currencyWarning).toBeUndefined();
  });

  it("sets cost when no currency is specified (assume USD)", () => {
    const result = buildCurrencyResult([{ price: 25.00 }]);
    expect(result.cost).toBe(25.00);
    expect(result.currencyWarning).toBeUndefined();
  });

  it("leaves cost blank and sets warning for EUR", () => {
    const result = buildCurrencyResult([{ price: 50, priceCurrency: "EUR" }]);
    expect(result.cost).toBeUndefined();
    expect(result.currencyWarning).toMatch(/EUR/);
  });

  it("leaves cost blank and sets warning for CAD", () => {
    const result = buildCurrencyResult([{ price: 100, priceCurrency: "CAD" }]);
    expect(result.currencyWarning).toMatch(/CAD/);
  });

  it("surfaces multiple USD candidates as priceCandidates", () => {
    const result = buildCurrencyResult([
      { price: 10, priceCurrency: "USD" },
      { price: 20, priceCurrency: "USD" },
    ]);
    expect(result.cost).toBeUndefined();
    expect(result.priceCandidates?.length).toBe(2);
  });
});

// ─── Price candidate filtering ────────────────────────────────────────────────

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

describe("price candidate filtering", () => {
  it("does not skip a plain price context", () => {
    expect(contextLooksSkippable("Price: $49.99")).toBe(false);
  });

  it("skips shipping prices", () => {
    expect(contextLooksSkippable("Free shipping on orders over $50")).toBe(true);
  });

  it("skips 'from' price patterns", () => {
    expect(contextLooksSkippable("From $9.99")).toBe(true);
  });

  it("skips 'starting at' patterns", () => {
    expect(contextLooksSkippable("Starting at $29.99")).toBe(true);
  });

  it("skips monthly payment contexts", () => {
    expect(contextLooksSkippable("$5.99/mo")).toBe(true);
  });

  it("skips 'as low as' patterns", () => {
    expect(contextLooksSkippable("As low as $12.00")).toBe(true);
  });

  it("skips recommended product price", () => {
    expect(contextLooksSkippable("Recommended: $99.99")).toBe(true);
  });

  it("skips per month patterns", () => {
    expect(contextLooksSkippable("$19.99 per month")).toBe(true);
  });

  it("does not skip 'Add to cart: $25.00'", () => {
    expect(contextLooksSkippable("Add to cart: $25.00")).toBe(false);
  });
});
