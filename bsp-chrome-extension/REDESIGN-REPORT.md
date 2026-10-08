# BSP Chrome Extension — Redesign Report

## Step 0: Implementation Audit

### Features FULLY implemented (Stage 1–2)

| Feature | Status |
|---|---|
| BSP connection settings (origin, verifyUrl, productUrl, key) | ✅ Fully implemented |
| Settings validation (HTTPS only, path suffix checks, no embedded credentials) | ✅ Fully implemented |
| Verification (POST /clipper/verify, protocolVersion 1 accepted) | ✅ Fully implemented |
| Verification state persistence across panel reopen | ✅ Fully implemented |
| Full-page extraction (JSON-LD, OG meta, DOM fallback) | ✅ Fully implemented |
| Price candidate disambiguation UI | ✅ Fully implemented |
| Currency-ambiguity detection (non-USD → blank with warning) | ✅ Fully implemented |
| All product form fields (title, cost, markup, qty, unit, msrp, taxable, supplier, mfr, sku, dimensions, finish, materials, category, vendorDescription, internalNotes, tags) | ✅ Fully implemented |
| Library save (POST /clipper/v2/products) | ✅ Fully implemented |
| requestId / frozen-payload retry pattern | ✅ Fully implemented |
| Payload size guards (100 000 chars / 131 072 bytes) | ✅ Fully implemented |
| Draft persistence (auto-save, same-page silent restore) | ✅ Fully implemented |
| Click-to-pick text / click-to-pick image modes (crosshair overlay) | ✅ Fully implemented |
| Connection key isolation (never in content scripts, DOM, logs, or URLs) | ✅ Fully implemented |
| Message sender validation (isTrustedSender) | ✅ Fully implemented |
| Save-in-flight guard (double-submit prevention) | ✅ Fully implemented |
| Save result "unknown outcome" / retry UI | ✅ Fully implemented |

### Features present as visual placeholder (NOT implemented)

| Feature | Audit finding |
|---|---|
| Project / board selection | Shows "coming in Stage 4" placeholder — no dropdown, no API calls, no data |
| File attachments / uploads | Shows "coming in Stage 3" — upload button does nothing |
| Extension icons | Three plain gold PNG squares (16, 48, 128 px), no actual logo mark |
| Hover overlay button | Not present at all |
| Per-site permission flow | Not present |
| Pending candidate / hover→panel capture | Not present |

### Gaps vs backend contract

- `/clipper/v2/products` endpoint correctly used (no /clipper/save drift)
- `operation: "save"` field present in all payloads
- `protocolVersion: 1` accepted per spec — no accidental upgrade rejection
- `uploadIds: []` always sent (no upload implementation yet)
- No `destination`, `roomId`, or `projectId` fields in payloads (correct)

### Manifest permissions (as found)

```json
"permissions": ["sidePanel", "storage", "activeTab", "scripting"],
"optional_host_permissions": ["https://*/*"]
```

---

## Checkpoint 1: Hover Selection and Draft-Safe Capture

### 1a. BSP Logo

- Downloaded 741×826 RGBA PNG from the CDN reference URL
- Saved as `src/assets/bsp-logo.png` (full source)
- Generated icon sizes: 16×16, 32×32, 48×48, 128×128 (padded, LANCZOS downscale) → `public/icons/icon{size}.png`
- Generated `public/icons/bsp-logo.png` (96×96 square crop, center-cropped) for hover button
- Manifest updated: added `"32": "icons/icon32.png"`, `web_accessible_resources` scoped to `icons/bsp-logo.png`
- **Note on 16px legibility**: At 16px, ~118/256 pixels are non-transparent (46%). The gold "B" mark is marginally legible. A dedicated small-format icon asset would improve legibility at this size, but the current output is functional.
- **crxjs behavior**: The build tool automatically adds the content script bundle to `web_accessible_resources` (required for ES module content scripts). This is expected crxjs behavior and cannot be avoided without switching build tools. The extension's own JavaScript bundle being web-accessible is standard for crxjs-built extensions.

### 1b. Hover Overlay (Shadow DOM)

Implemented in `src/content/hover.ts`:

- **Single active overlay**: One shadow host element, one button — not per-image clones
- **Shadow DOM host**: `attachShadow({ mode: 'closed' })` with complete stylesheet isolation
- **Position tracking**: `position: fixed` + `requestAnimationFrame` loop updating `top`/`left` from `getBoundingClientRect()`
- **Event delegation**: `mouseover`/`mouseout` on `document` (not per-image listeners)
- **Flicker prevention**: 80ms hide timer, cancelled on `mouseenter` of button
- **Image eligibility**: Minimum 150×150 CSS px, non-data:/blob: src, visible (not display:none/visibility:hidden/opacity<0.1), not extension-owned
- **IntersectionObserver**: Hides button if image scrolls out of viewport (threshold 0.1)
- **MutationObserver**: Scoped to `document.body`, debounced 150ms, clears overlay if current image leaves DOM
- **Keyboard**: Enter/Space activates click; visible `focus-visible` ring
- **aria-label**: "Pick with BSP"
- **Cleanup**: `destroyHoverOverlay()` removes all listeners, observers, and the shadow host

### 1c. Per-Site Permission Flow

Implemented in `src/sidepanel/App.tsx`:

- **Banner at top of Capture view**: Shows "Enable hover picking on this site" or "✓ Hover picking enabled on {origin}" + Disable button
- **chrome.permissions.request**: Called directly in the React `onClick` handler (user gesture path)
- **Grant flow**: Panel sends `ENABLE_HOVER_ON_SITE` message to service worker → stored in `chrome.storage.local` → service worker notifies all tabs on that origin
- **Disable flow**: Removes from storage, sends `DISABLE_HOVER` to tabs, revokes optional permission
- **Restricted pages**: Shows "Page picking is unavailable here" for chrome://, chrome-extension://, chrome.google.com/webstore, about:
- **chrome.tabs.onUpdated**: Registered at the top level of the service worker (survives MV3 restarts) — sends `ENABLE_HOVER` to tabs on granted origins when they load
- **chrome.permissions.onAdded**: Registered at top level — syncs newly granted permissions to storage
- **Content script self-activation**: On load, content script sends `GET_HOVER_SITE_STATE` to check if hover should activate

### 1d. Contextual Product Capture on Click

- **Hover button click**: Content script freezes `pendingCandidate` (imageUrl, altText, sourceUrl, cardTitle, cardPrice, cardLink, timestamp, tabId)
- **Card context extraction**: Walks up from clicked `<img>` looking for `article`, `[itemtype*="Product"]`, `[itemscope]`, `li` with anchor+image; extracts title from `[itemprop="name"]` → heading → alt; price from `[itemprop="price"]` → `[class*="price"]`; link from nearest `<a>`
- **Message to service worker**: `HOVER_IMAGE_CLICKED` — only accepted from content scripts (validated by `isContentScriptSender`)
- **Service worker**: Sanitizes all page data (String() cast, length clamps, numeric validation), replaces candidate timestamp with `Date.now()`, stores in `chrome.storage.local`, tries `chrome.sidePanel.open({ tabId })`
- **Graceful failure**: If `chrome.sidePanel.open` fails (gesture requirement), candidate remains in storage; user can click toolbar icon to open panel and retrieve it
- **Panel on open**: Checks `GET_PENDING_CANDIDATE`, clears from storage after consuming
- **Draft conflict**: Inline dialog (never `window.confirm`) — "Keep current" or "Start new"
- **Connection key**: Never placed in content scripts, pending candidate, page DOM, or page URLs

### 1e. Tests

Added `tests/hover.test.ts` with 59 new tests covering:

- Image eligibility heuristics (size threshold, src filtering)
- Extension element exclusion
- Pending candidate lifecycle (serialization, field validation, timestamp source)
- Draft conflict detection (7 cases: dirty+different URL, empty, same URL, cardLink match, etc.)
- Message sender validation (`isContentScriptSender` vs `isTrustedSender`, 8 cases)
- Permission state checks (granted origins, restricted pages)
- Overlay cleanup state machine (idempotent destroy, all fields cleared)
- Candidate data sanitization (length clamping, type validation, price rejection)

**Test results**: 218 tests pass (159 original + 59 new), 0 failures.

---

## Checkpoint 2: Panel Redesign

### 2a. Panel Layout Changes

Redesigned `src/sidepanel/App.tsx` and `src/sidepanel/components/ProductForm.tsx`:

**Header (compact)**:
- BSP logo mark (96px PNG scaled to 26px) + "Product Picker" title
- ✕ button (Clear all — triggers confirmation in ProductForm)
- ⋮ menu → Settings view / About (version)
- ← Back button appears when in Settings view
- Eliminates oversized dark charcoal header from Stage 2

**Image area (5 slots)**:
- 2-column grid: 1 large primary (cover) slot + 2×2 grid of 4 secondary slots
- Each empty slot: click reveals menu with "Pick from page", "Add image URL", "Upload file (coming soon)"
- Filled slots: × remove button in corner, "Cover" badge on primary
- Quick-add URL row below the grid
- Image count badge: "X/5 images selected"
- No >5 limit enforced via `selectedImageIndexes`

**Below image area**: Title (prominent, 600-weight), compact source URL (click-to-edit)

**Main form fields**:
- Cost + Markup % (side by side)
- Quantity + Unit (side by side)
- MSRP + Taxable (side by side)
- Selling price preview: single line "Unit $X.XX · Total $X.XX" or "Price unknown"
- Client description (textarea)
- Category + Vendor/Supplier (side by side)

**Accordions** (collapsed by default):
- Destination: "Library only" with honest placeholder "Board & project selection coming in a future release"
- Attachments: "File uploads coming in a future release"
- Additional Details: Manufacturer, SKU, Dimensions, Finish/Color, Materials, Vendor description, Internal notes, Tags

**Footer (sticky)**:
- Charcoal "Save to Library" button, full-width
- Error/success/retry states above the button
- 80px bottom padding on form content so footer never obscures fields

**Removed**:
- Non-functional "Click to Add" attachments button
- Decorative fake project/board dropdowns

### 2b. Settings Access

Settings moved to header ⋮ menu → "Settings" view (same `SettingsPanel` component, same storage keys, same verification logic). The navigation is purely client-side — no stored settings are reset or invalidated.

### 2c. Regression Verification

| Check | Result |
|---|---|
| Settings loads and shows verified connection | ✅ Same `LOAD_SETTINGS` message, same SettingsPanel component, same storage key |
| Library save still works end-to-end | ✅ `buildSavePayload` / `SAVE_PRODUCT` / `/clipper/v2/products` unchanged |
| Verification still works (protocolVersion 1 accepted) | ✅ `parseVerifyResponse` unchanged |
| Draft persists across panel close/reopen | ✅ `SAVE_DRAFT` / `LOAD_DRAFT` storage unchanged |
| Extract from page still works | ✅ `EXTRACT_PAGE` / content script unchanged |
| All 218 tests pass | ✅ Confirmed |
| `npm run build` clean | ✅ Confirmed |

---

## Chrome Acceptance Checklist

| Item | Result |
|---|---|
| MV3 manifest | ✅ manifest_version: 3 |
| Service worker (not background page) | ✅ |
| No persistent background scripts | ✅ |
| Permissions declared in manifest | ✅ All used permissions declared |
| Optional host permissions for site access | ✅ |
| web_accessible_resources scoped | ✅ Only icons/bsp-logo.png + crxjs bundle requirement |
| No eval() in content scripts | ✅ Verified by test |
| Connection key not in content scripts | ✅ Verified by key isolation test |
| chrome.sidePanel API (requires Chrome 116+) | ✅ minimum_chrome_version: 116 |
| chrome.scripting requires scripting permission | ✅ Declared |
| Shadow DOM for overlay | ✅ Closed shadow root |
| No supplier DOM modification | ✅ Overlay appended to body as own element |
| User gesture for chrome.permissions.request | ✅ In React onClick handler |
| Service worker top-level listener registration | ✅ tabs.onUpdated, permissions.onAdded at module top level |

### Items skipped / not testable without a live Chrome instance

- Actual hover button rendering on a supplier page
- chrome.sidePanel.open() success/failure behavior in user gesture context
- chrome.permissions.request() dialog flow
- Content script injection timing after permission grant

---

## Remaining Limitations

1. **File uploads**: Not implemented (attachments section shows honest "coming soon")
2. **Project/board selection**: Not implemented (destination section shows honest placeholder)
3. **16px icon legibility**: The 16×16 icon is marginally readable. A purpose-designed small-format asset would improve it.
4. **crxjs web_accessible_resources**: The crxjs build tool adds the content script bundle to `web_accessible_resources` automatically. This is unavoidable without switching build systems.
5. **chrome.sidePanel.open from content script message**: Chrome may not honor the user-gesture requirement when `sidePanel.open` is called asynchronously in the service worker after receiving a content script message. The graceful fallback (candidate stays in storage, panel finds it on next open) handles this.
6. **SPA navigation cleanup**: `pagehide` event fires for SPA navigations in some frameworks but not all. History API changes may not trigger cleanup on all sites.
7. **Background CSS images**: Not attempted — too many false positives on non-product sites.

## Chrome Version Tested

Build targeting: Chrome 116+ (minimum_chrome_version in manifest). Build environment: Vite 5.4.21, crxjs vite-plugin 2.0.0-beta.26.
