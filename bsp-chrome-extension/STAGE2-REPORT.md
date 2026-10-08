# Stage 2 Report – BSP Chrome Extension

## What Was Built

### 1. Content Script: Page Extraction (`src/content/extract.ts`)

Full implementation of product data extraction with a three-tier priority strategy:

**JSON-LD (highest priority)**
- Scans up to 10 `<script type="application/ld+json">` blocks
- Finds `@type: Product` at top level, inside `@graph`, or inside top-level arrays
- Parses as data via `JSON.parse` — never `eval`
- Extracts: name, description, url, sku, brand/manufacturer, color, material, category, image(s), offers
- Offer processing rejects price ranges (`lowPrice`/`highPrice`), validates numeric bounds
- Currency ambiguity: non-USD currency → cost left blank + `currencyWarning` included

**Open Graph / Meta (fallback)**
- Reads `og:title`, `og:description`, `og:image`, `og:url`
- Resolves relative URLs against page URL

**DOM fallback**
- `<h1>` text for title (first visible, non-overlay element)
- Price regex scanner on visible text nodes — skips shipping, delivery, "from", "starting at", monthly payment, recommended price, "as low as" patterns
- Checks `og:site_name` / author meta for supplier name
- Image candidates from `<img>` elements (≥ 50px): `currentSrc`, `src`, `data-src`, `data-lazy-src`, `data-original`, `srcset` entries; resolves and deduplicates

**Bounds enforced**: max 10 JSON-LD blocks, max 5 price candidates, max 10 image candidates, shadow root traversal max depth 3.

**Return type**: `ExtractionResult` — bounded, page-URL-anchored, no credentials.

### 2. Click-to-Pick (`src/content/extract.ts`)

- `START_PICK_TEXT`: adds a fixed banner, listens for click + hover events (capture phase). Hover outlines the hovered element in gold without shifting layout. Click captures `textContent` of the clicked element.
- `START_PICK_IMAGE`: same, but captures `currentSrc` or `src` (resolved to absolute URL) from the clicked image or nearest child image.
- `Escape` cancels pick mode, removes all listeners and overlay.
- Complete teardown on pick completion, cancellation, or new pick start.
- Own overlay elements (`bsp-extension-overlay` class) are ignored during picking.

### 3. Side Panel: Product Form (`src/sidepanel/components/ProductForm.tsx`)

Full product review/edit form with all spec-required sections:

| Section | Contents |
|---|---|
| **Images & Title** | Thumbnail gallery (external refs only), checkbox-select, remove, add URL, pick-image button; title field with pick-text; read-only source URL (expandable to edit) |
| **Pricing** | Cost (blank = omit, $0 is distinct), MSRP, Markup %, Quantity, Unit, Taxable checkbox; live pricing preview |
| **Product Info** | Description (20000 char), Category, Vendor/Supplier name |
| **Destination** | "Library only" radio (selected); placeholder for Stage 4 board selection |
| **Attachments** | Placeholder for Stage 3 file uploads |
| **Additional Details** | Collapsible: Manufacturer, SKU, Dimensions, Finish/Color, Materials, Vendor description, Internal notes, Tags |

**Auto-fill indicators**: gold dot on field label for each field populated by extraction.

**Multi-price picker**: when `priceCandidates` has > 1 entry, a picker row appears above the form.

**Currency warning**: displayed prominently when extraction skipped the price due to ambiguity.

### 4. Pricing Preview (`src/sidepanel/components/PricingPreview.tsx`)

Live computation:
- `costCents = round(cost × 100)`
- `unitSellingCents = round(costCents × (1 + markupPercent/100))`
- `totalCents = round(unitSellingCents × quantity)`
- Shows "Price unknown" when cost is blank

Verified spec example: cost $19.99, markup 15%, qty 2.5 → unit $22.99, total $57.48.

### 5. Library-Only Save

**Payload builder** (`src/shared/validation.ts: buildSavePayload`):
- Omits all blank optional fields (never sends `null` or `""` for optional fields)
- Never includes `companyId`, `userId`, `productJson`, `destination`, `roomId`
- `imageUrls`: selected only, HTTP(S) only, max 5
- Tags: parsed from comma-separated, trimmed, max 50, each ≤ 100 chars

**Service worker save handler** (`src/service-worker/index.ts`):
- Trusts only own extension contexts (existing `isTrustedSender` check)
- Persists pending save to storage **before** POSTing (idempotent retry record)
- `saveInFlight` guard prevents double-submit
- 5xx / network error: leaves pending save in storage, returns `UNKNOWN:` prefixed error
- 4xx: clears pending save, returns error message
- Size validation in `saveProduct()`: checks `bodyStr.length ≤ 100000` and `byteLength ≤ 131072`

**Retry logic** in ProductForm: Retry button reuses the exact frozen payload (same `requestId`, same fields) — no risk of changed-payload conflict.

### 6. Draft Persistence

- Auto-saved to `chrome.storage.local` 800 ms after any form change (debounced)
- Loaded on panel mount via `LOAD_DRAFT` message
- Same-URL draft: restored silently with timestamp banner
- Different-URL draft: `window.confirm` prompt before replacing
- Cleared on successful save

### 7. App Shell (`src/sidepanel/App.tsx`)

Replaced Stage 1 placeholder with a two-tab shell (Capture / Settings). Active tab URL and tab ID are resolved on mount via `chrome.tabs.query`.

### 8. Tests (`tests/extract.test.ts`, `tests/product-form.test.ts`)

**159 total tests pass** (104 new in Stage 2 + 55 existing in Stage 1).

New test coverage:
- `resolveImageUrl`: absolute, relative, protocol-relative, data:, blob:, empty
- JSON-LD parsing: top-level Product, @graph, array, multi-type, null, string inputs
- Offer price parsing: numeric, string with $/, ranges, negatives, missing currency
- Currency ambiguity: USD accepted, null-currency accepted, EUR/CAD → warning + blank cost
- Price candidate filtering: all skip-pattern types verified
- `validateProductForm`: all fields including edge cases (0 vs blank cost, exact limits)
- `validateMoneyField`: standalone tests for money field validation
- `computePricingPreview`: spec example, edge cases, rounding, 0-cost vs blank
- `buildSavePayload`: field omission, imageUrl limits, tag parsing, forbidden fields, size
- Draft persistence: same-URL restore, different-URL prompt, serialization round-trip
- Save error handling: UNKNOWN prefix, 400 vs network, retry idempotency, replayed
- `parseSaveResponse`: valid, replayed, missing fields, null input, optional selectionId
- Request size validation: normal and large payloads

---

## Manual Test Steps Against Real BSP Backend

### Prerequisites
1. Load the `dist/` folder as an unpacked extension in Chrome
2. Go to the Settings tab, enter valid BSP credentials, click "Verify Connection"
3. Confirm status shows "Verified" with connection name

### Test: Extract from a real supplier page

1. Navigate to any product page (e.g., an Amazon or manufacturer product page)
2. Click the BSP toolbar icon to open the side panel
3. In the Capture tab, click **"Extract from page"**
4. Verify: title field populates (gold dot appears on label)
5. Verify: source URL shows the current page URL
6. Verify: at least one image thumbnail appears
7. If price was found: verify cost field is populated (or currency warning appears)
8. Manually edit the title — confirm field is editable

### Test: Click-to-pick text

1. On any product page with the side panel open
2. Click **"Pick"** next to the Title field
3. Verify: golden banner appears at top of page
4. Hover over page elements — verify gold outline appears
5. Click a heading or price element — verify value appears in the title field
6. Confirm the banner and outline are removed after picking

### Test: Click-to-pick and Escape

1. Click **"Pick"** next to any field
2. Press **Escape**
3. Verify: banner disappears, no outline remains, field is unchanged

### Test: Image gallery

1. After extraction, thumbnails should appear in the gallery
2. Check/uncheck the checkbox on a thumbnail — verify selection state
3. Click **×** on a thumbnail — verify it is removed
4. Paste an image URL into the URL field and click **"Add URL"** — verify it appears
5. Verify that deselected images do not appear in the save payload (check DevTools)

### Test: Save to Library (library-only)

1. Fill in at minimum: Title and Source URL
2. Add at least one image (or leave blank)
3. Click **"Save to Library"**
4. Verify: DevTools → Network shows a POST to the product URL with `Authorization: Bearer …`
5. Verify: POST body has `"operation": "save"`, no `destination`, no `companyId`
6. On success: verify "Saved to library" message with "Open library product" link appears
7. Click the link — verify it opens the correct BSP library item page

### Test: Draft persistence

1. Fill in some fields in the Capture form
2. Close the side panel (click elsewhere to dismiss)
3. Re-open the side panel
4. Verify: form fields are restored, timestamp banner shows

### Test: Different-page draft prompt

1. Fill in fields on page A
2. Navigate to page B and open the side panel
3. Verify: a confirm dialog asks whether to replace the draft from page A

### Test: Protected page

1. Navigate to `chrome://settings` or `chrome://extensions`
2. Open the side panel
3. Click **"Extract from page"**
4. Verify: a message appears explaining the page cannot be inspected

### Test: Currency warning

1. Find a product page with EUR or GBP pricing in its JSON-LD (e.g., a UK retailer)
2. Run extraction
3. Verify: cost field is blank, yellow warning appears mentioning the currency found

### Test: Unknown save outcome (simulated)

1. Disconnect your internet or block the product URL in DevTools
2. Click "Save to Library"
3. Verify: "Save outcome unknown — retry?" message appears with a Retry button
4. Restore connectivity, click Retry — verify same requestId is used (check DevTools)

---

## Acceptance Checklist Status

### Stage 2 items — satisfied

- [x] Extraction logic: JSON-LD, OG, DOM fallback, all implemented and tested
- [x] JSON-LD parsed as data (JSON.parse only, never eval) — verified by test
- [x] Currency ambiguity → cost blank + warning, never silently USD
- [x] Price candidates surfaced for user review when multiple found
- [x] Click-to-pick text and image with Escape cancellation
- [x] Pick mode uses outline (not background) — no layout shift
- [x] All extracted fields are editable
- [x] Auto-fill gold dot indicators
- [x] Image gallery: thumbnails, checkbox selection, remove, add URL, pick
- [x] Image URLs resolved to absolute http(s), deduplicated, max 10 candidates
- [x] Pricing preview with correct math and live updates
- [x] Zero cost distinct from blank — UI shows "Price unknown" only when blank
- [x] Form validation: all fields with inline errors, save disabled when invalid
- [x] Save payload omits blank optional fields — never null/empty strings
- [x] Forbidden fields never sent: companyId, userId, productJson, destination, roomId
- [x] imageUrls max 5 in save payload
- [x] Request size validated (≤ 131072 bytes, ≤ 100000 JS chars) before send
- [x] `requestId` via `crypto.randomUUID()`
- [x] Pending save persisted to storage before POST
- [x] Double-submit guard (saveInFlight flag)
- [x] Unknown outcome: retain pending save, show Retry button
- [x] Retry uses same requestId + frozen payload
- [x] `replayed: true` → "Already saved" (not error)
- [x] Success link: BSP origin + `/library/my-items?tab=materials&materialId=...`
- [x] Draft persistence: auto-save + restore + different-URL prompt + clear on success
- [x] Protected pages: helpful message, not crash
- [x] Content script: no storage import, no credentials, no HTML injection
- [x] All Stage 1 tests continue passing (55 tests)
- [x] All Stage 2 tests pass (104 new tests, 159 total)
- [x] `npm run build` produces clean `dist/`

### Still pending (later stages)

- [ ] Image uploads / file attachments (Stage 3)
- [ ] Project & board selection (Stage 4)
- [ ] `selectionId` / `selectionPath` display in the UI (Stage 4)

---

## Known Limitations

**Extraction quality varies by site:**
- Sites relying heavily on JavaScript rendering may not populate JSON-LD at `document_idle`; some data may be missing
- Custom web components and deeply nested shadow DOMs beyond depth 3 are not traversed
- Sites using non-standard price formats (e.g., price split across multiple elements) may not be captured
- Lazy-loaded images not yet loaded at extraction time may not be captured
- Variant selection: the current implementation captures the DOM state at extraction time; if the user changes a variant after page load, re-running extraction will pick up the new state

**Protected pages:**
- `chrome://`, `chrome-extension://`, Chrome Web Store, and PDF pages cannot be inspected

**Image uploads:**
- Stage 2 only supports external image URL references; file upload is Stage 3

**Pick mode:**
- Only works on the active tab that the side panel is associated with
- If the tab navigates during pick mode, the pick is cancelled (message channel closes)

**Currency detection:**
- Relies on `priceCurrency` in JSON-LD or known currency symbols; pages with ambiguous pricing (price shown without currency context) may silently skip price extraction
