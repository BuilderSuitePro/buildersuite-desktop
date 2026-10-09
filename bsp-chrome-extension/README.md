# Builder Suite Pro — Chrome Extension

A Chrome side-panel extension for capturing products from supplier websites directly into your BSP (Builder Suite Pro) library or board.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Chrome | 116 or later (required for `chrome.sidePanel.open`) |
| Node.js | 18+ (only for building from source) |
| npm | 9+ (only for building from source) |

The prebuilt **`bsp-chrome-extension.zip`** (in the repo root) can be loaded directly without Node.js.

---

## Installation — Load Unpacked

### Option A: Use the prebuilt zip (recommended)

1. Download **`bsp-chrome-extension.zip`** from the repository root.
2. Unzip it to a folder (e.g. `~/bsp-ext/`).
3. Open Chrome → `chrome://extensions/` → Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** → select the folder you unzipped into.
5. The BSP toolbar icon appears. Click it to open the side panel.

### Option B: Build from source

```bash
# 1. Install Node.js 18+ and npm, then:
git clone <this-repo>
cd bsp-chrome-extension
npm install
npm run build   # outputs to dist/
```

Then load `dist/` using **Load unpacked** in Chrome as described above.

---

## Initial Settings Configuration

> All settings are stored locally in your browser. Nothing is synced to Chrome Sync or any cloud.

### Where to find your credentials

1. Log in to your BSP workspace.
2. Navigate to **Settings → Integrations → Clipper Connect** (URL path: `/integrations/clipper/connect`).
3. Copy the three URLs and the Connection Key shown there.

### How to enter them

1. Open the BSP side panel → click the **⋮** menu (top-right) → **Settings**.
2. Enter the following fields:

| Field | Where to find it | Example |
|---|---|---|
| **BSP Web App Origin** | Your BSP workspace's root URL (no path) | `https://app.buildersuitepro.com` |
| **Verification URL** | Shown on the Clipper Connect page | `https://app.buildersuitepro.com/clipper/verify` |
| **v2 Product URL** | Shown on the Clipper Connect page | `https://app.buildersuitepro.com/clipper/v2/products` |
| **Connection Key** | Shown on the Clipper Connect page (bearer token) | `bsp_live_...` |

3. Click **Save Settings**.
4. Click **Verify Connection** — you should see your connection name and the verified timestamp.

> **Security note:** The Connection Key is stored only in `chrome.storage.local`. It is never written to `chrome.storage.sync`, the page DOM, URL parameters, console logs, or content scripts.

---

## One-Time: Enable Automatic Picking on Websites

The BSP button that appears directly on product images requires a one-time optional permission grant.

### Quick setup

1. Open the BSP side panel on any website.
2. In the banner at the top of the Capture view, click **Enable**.
3. Chrome shows a permission dialog: **"Allow BSP to read and change data on all sites"** — click **Allow**.
4. The banner changes to show **"✓ Automatic picking is ON"**.

After this, hover over any product image (≥ 150 × 150 px) on any website — a white BSP button appears in the upper-right corner of the image. Click it to capture the product.

### Per-site setup (alternative)

If you prefer not to grant broad access, you can grant access to individual sites. The extension will prompt when you first visit a site where hover hasn't been enabled.

### Disabling

Click **Disable** in the banner. The optional host permissions are revoked.

### Privacy note

When hover picking is enabled, the content script can see page content on the sites you visit. This data stays local — the extension only transmits product data (title, images, price, URL) to BSP when you explicitly save. **The Connection Key is never accessible from content scripts.**

---

## Capturing Products

### Hover (automatic)

With hover picking enabled, hover over any product image ≥ 150 × 150 CSS pixels. A BSP button appears. Click it — the panel opens automatically, pre-filled with the image, any detected title, and price.

### Extract from page

Click **↓ Extract all fields from page** in the panel to fill in title, price, images, and metadata from the currently active tab. The extension extracts from JSON-LD structured data, OpenGraph meta tags, and DOM content, in that order of priority.

### Manual

Fill in the form fields manually. Required: **Product Title** and **Source URL**.

---

## Image Limits and Attachments

- **Images:** up to 5 per product (combined uploaded + external URLs)
- **Attachments:** up to 10 per product (JPEG, PNG, WebP, GIF, PDF; max 10 MB each)
- **Supported image formats:** JPEG, PNG, WebP, GIF
- **Unsupported:** SVG, HEIC/HEIF, AVIF — rejected with a descriptive error

### Cover image rule

The first **uploaded** (stored) image in slot order is always the cover when uploads exist. External image URLs are the cover only when there are no stored uploads.

### Upload interruption recovery

If the browser restarts after bytes are uploaded but before the `finish` step completes, a yellow recovery banner appears on next open. Click **Retry** to complete the operation without re-uploading bytes.

> **Known limitation:** If `finish` cannot be reached after multiple retries, the uploaded bytes may remain on the storage server ("orphaned bytes"). BSP support can assist with cleanup.

---

## Saving to Library

1. Fill in at least a **Product Title** and **Source URL**.
2. Click **Save to Library**.
3. The product appears in **BSP Library → My Items → Materials**.
4. The success banner shows an **"Open in library"** link that goes to `/library/my-items?tab=materials&materialId={id}`.

---

## Saving to a Board

Expand the **Destination** accordion before saving.

1. Select **Add to board**.
2. Choose a **Project** from the dropdown (your accessible projects; paginated, 25 at a time).
3. Choose a **Board**.
4. Optionally choose an existing **placeholder** to fill, or leave at **New selection** (default).
5. Click **Save to Library & Board**.

> **Client visibility:** Selections are private by default. Share with your client from the board when ready. The client portal only shows selling price; internal cost, markup, vendor description, and private notes are never visible to clients.

---

## Pricing Preview

| Field | Description |
|---|---|
| **Cost** | Your cost in USD. Leave blank if unknown — shown as "Price unknown". Zero and blank are visually different. |
| **Markup %** | Applied as: `unit_selling = round(cost_cents × (1 + markup/100)) / 100` |
| **Quantity** | Multiplied for the total: `total = round(unit_selling_cents × qty) / 100` |
| **Non-USD prices** | If the page reports a non-USD or ambiguous currency, cost is left blank with a warning. It is NOT silently saved as USD. |

---

## Permissions

| Permission | Type | Justification |
|---|---|---|
| `sidePanel` | Required | Enables the BSP side panel UI |
| `storage` | Required | Stores settings, drafts, granted origins, and upload tickets locally |
| `activeTab` | Required | Reads the current tab's URL and ID for extraction and picking |
| `scripting` | Required | Injects and manages the content script for page extraction and hover picking |
| `https://*/*` | Optional host | Required for hover picking — granted only when you click **Enable**. You can revoke it at any time from `chrome://extensions/` or by clicking **Disable** in the panel. |
| `http://*/*` | Optional host | Same as above, for non-HTTPS supplier sites |

The extension does **not** request `tabs`, `history`, `bookmarks`, `cookies`, `webRequest`, `notifications`, or any other sensitive permissions.

---

## Security Properties

- Connection Key is stored only in `chrome.storage.local` (never `.sync`, never the DOM, never URL params)
- Content scripts never receive the Connection Key
- The BSP `Authorization` header is sent **only** to BSP API endpoints — never to upload URLs or supplier sites
- The hover button uses a closed Shadow DOM to prevent style conflicts with supplier pages
- All page data extracted by content scripts is treated as untrusted and sanitized before use
- `externally_connectable` is not in the manifest — no external sites can message the extension
- Service worker validates `chrome.runtime.MessageSender` before processing privileged messages

---

## Development

```bash
npm install           # install dependencies
npm run build         # build to dist/
npm run dev           # watch mode (rebuild on change)
npm test              # run unit test suite (415 tests)
npm run test:coverage # with coverage report
```

---

## Architecture

| Layer | Files | Role |
|---|---|---|
| Service worker | `src/service-worker/` | All privileged operations: API calls, storage, pending candidate relay, permission management. Connection key never leaves here. |
| Content script | `src/content/` | Page extraction (JSON-LD → OG → DOM), click-to-pick, hover overlay (Shadow DOM). No access to credentials. |
| Side panel | `src/sidepanel/` | React UI: product form, settings, hover controls, destination selector. |
| Shared | `src/shared/` | Pure validation and upload utilities — safe to use in any context. |
| Types | `src/types/` | TypeScript types shared across all layers. |

---

## Known Limitations

- The 16 × 16 icon is limited in legibility at small size (inherent browser constraint).
- The CRXJS Vite plugin uses hashed asset filenames. Dynamic content script registration reads the built manifest at runtime to get the correct path.
- Orphaned upload bytes (bytes uploaded but `finish` never called) cannot be cleaned up by the extension; BSP support is required.
- Client portal testing requires a separate client account and is not covered by the unit test suite.
- The extension does not support Chrome's "incognito" mode (extension is disabled in incognito by default unless explicitly enabled by the user).
