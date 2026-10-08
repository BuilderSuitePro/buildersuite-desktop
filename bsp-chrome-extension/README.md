# Builder Suite Pro — Chrome Extension

A Chrome extension for capturing products from supplier websites directly into your BSP (Builder Suite Pro) library.

---

## Quick Start

### Install (unpacked)

1. Run `npm install && npm run build`
2. Open Chrome → `chrome://extensions/` → Enable **Developer mode**
3. Click **Load unpacked** → select the `dist/` folder
4. Click the BSP toolbar icon to open the side panel

### Configure

1. Open the side panel → click **⋮** → **Settings**
2. Enter your BSP Web App Origin, Verification URL, v2 Product URL, and Connection Key (from BSP → Integrations → Clipper Connect)
3. Click **Save Settings**, then **Verify Connection**

---

## Hover Picking

Hover picking lets you click a button that appears directly on product images while you browse — no manual copy-paste required.

### How to enable hover picking on a site

1. Navigate to the supplier website (e.g. `https://www.example-supplier.com`)
2. Open the BSP side panel (click the toolbar icon)
3. In the banner at the top of the Capture view, click **Enable**
4. Chrome will show a permission dialog — click **Allow**
5. The button will now say "✓ Hover picking enabled on https://www.example-supplier.com"

Once enabled, a white BSP button will appear in the upper-right corner of eligible product images as you hover over them. Click it to instantly capture that product's image, title, price, and source URL into the panel form.

### What permissions are requested?

When you click **Enable**, the extension requests access to the specific website origin you are currently browsing (e.g. `https://www.example-supplier.com/*`). This is an [optional host permission](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions#optional) — you are in full control of which sites the extension can access.

The extension **never** accesses:
- Other websites you haven't explicitly enabled
- Your BSP connection key from page scripts or content scripts
- Any stored credentials via the page DOM

### How to disable hover picking

1. Navigate to the site where hover picking is enabled
2. Open the BSP side panel
3. Click **Disable** in the banner
4. The optional host permission for that origin is also revoked

### Enable on all websites (broad access)

If you want hover picking to work everywhere without enabling per site, you can grant the `https://*/*` optional permission. To do this, use `chrome.permissions.request` in an extension context, or use Chrome's extension settings page. Note that this grants the extension access to read all websites you visit.

---

## Capturing Products

### Hover (automatic)

With hover picking enabled, hover over any product image ≥ 150×150 CSS pixels. A white BSP button appears. Click it to capture.

### Extract from page

Click **↓ Extract all fields from page** in the panel to automatically fill in title, price, images, and metadata from the currently active tab.

### Manual

Fill in the form fields manually. Required: **Product Title**.

---

## Saving to Library

1. Fill in at least a **Product Title** and **Source URL**
2. Click **Save to Library**
3. The product appears in your BSP Library → My Items

---

## Image Slots

The image grid shows 5 slots (1 cover + 4 additional). **Cover priority** follows the BSP backend rule:
- The first **uploaded** (stored) image in order is always the cover when any uploads exist.
- External image URLs are the cover only when there are no stored uploads.

For each slot you can:
- **Upload image** — opens a file picker (JPEG, PNG, WebP, GIF; max 10 MB). Shows validating → hashing → uploading → ready progress.
- **Add image URL** — paste an external URL directly
- **Pick from page** — click a crosshair to select an image on the current tab

### Upload flow (per file)
1. Local validation (MIME type, size, filename)
2. SHA-256 fingerprint computed in-browser (standard base64, 44 chars)
3. `begin` request to BSP API → returns an upload URL
4. Ticket persisted to `chrome.storage.local` before bytes are sent
5. Raw bytes POSTed to the upload URL (no BSP credentials sent here)
6. `finish` request to BSP API → ticket becomes **ready**
7. Ticket ID is included in the save `uploadIds` on the next Save

**Unsupported formats:** SVG, HEIC/HEIF, and AVIF are rejected with an explanation. Convert to JPEG, PNG, or WebP before uploading.

### Interruption recovery
If the panel closes or the browser restarts after bytes are uploaded but before `finish` completes, a recovery banner appears on next open. Click **Retry** to complete the finish step without re-uploading.

> **Known limitation:** If `finish` cannot be reached after multiple retries, the uploaded bytes may remain on the storage server ("orphaned bytes"). There is no cleanup endpoint — BSP support can assist if this becomes an issue.

---

## Attachments

Expand the **Attachments** accordion to upload files (JPEG, PNG, WebP, GIF, or PDF; max 10 MB each). Up to 10 attachments per product.

- Per-attachment progress indicator (state badge + upload %)
- Remove button (triggers a `discard` API call; result shown truthfully)
- All attachments are included in the save `uploadIds` after the images

---

## Draft Persistence

Your in-progress form is auto-saved as a draft every ~800ms. When you reopen the panel on the same page, the draft is restored silently. On a different page, you are prompted before the draft is replaced.

---

## Permissions Summary

| Permission | Why |
|---|---|
| `sidePanel` | Opens the BSP side panel UI |
| `storage` | Saves your settings, drafts, and granted origins locally |
| `activeTab` | Reads the URL and tab ID of your current tab |
| `scripting` | Injects the content script on sites you've enabled |
| `https://*/*` (optional) | Required for hover picking on specific sites you approve |

---

## Development

```bash
npm install          # install dependencies
npm run build        # build to dist/
npm run dev          # watch mode
npm test             # run test suite
```

---

## Destination: Project → Board → Selection

The **Destination** accordion in the product form lets you route a save to a specific board in your BSP workspace, in addition to the library.

### Library only (default)
Saves the product to your BSP library only. No destination field is sent in the API payload.

### Add to board
Enables a three-level selection flow:

1. **Project** — choose from your accessible BSP projects. Pages load 25 at a time; click **Load more** to fetch the next page. Use **↻ Refresh** to re-fetch from page 1.
2. **Board** — loads automatically after a project is selected. If the project has no boards, a link to create one in BSP is shown.
3. **Selection** — two sub-options after a board is selected:
   - **New selection** (default) — creates a private, pending selection on the board. The cover image comes from the first uploaded image (or `imageUrls[0]`). The selling price (cost + markup) appears on the board; internal cost, markup details, vendor description, notes, and attachments remain in the library only. Share the selection with your client from the board when ready.
   - **Fill placeholder** — replaces an existing placeholder selection (`canReplace: true`). Only eligible selections are shown; ordered/ineligible ones are shown disabled or omitted. Replaces product fields (title, description, supplier, dimensions, images, etc.) while **preserving** deadline, allowance, responsibility, ordering position, status, prior staff notes, sharing state, and client decisions and comments.

### Reset rules
- Selecting a different **project** clears the board selection and any chosen placeholder.
- Selecting a different **board** clears any chosen placeholder.
- Switching back to **Library only** clears project, board, and placeholder selection entirely.

### Warnings
- **Replacement warning** — always shown before saving over a placeholder: *"Replacing this selection updates product fields only. Deadlines, allowances, status, sharing, and client decisions are preserved."*
- **Shared selection warning** — shown additionally when the chosen placeholder is already shared with the client: *"This selection is already shared with the client. Saving will update what they see immediately. Their decisions and comments will be preserved."*

### Blocking rules
- If a project is selected but no board is chosen: save is disabled and a message prompts to select a board. Library-only is still available and unblocked.
- A board mode destination with only a projectId (no boardId) is never sent to the server.

### 403 / Permission handling
If the discovery API returns 403:
1. The extension calls `VERIFY_CONNECTION` to check whether the connection key is still valid.
2. **Key valid, selections forbidden** → board save is disabled with an explanation; library-only remains fully available.
3. **Key possibly revoked** → a reconnection prompt is shown; the key is **never automatically erased** based solely on a 403 from discovery.

### Save payload
- **Library only:** `{ operation, requestId, product, uploadIds }` — no `destination` field
- **Board (new selection):** adds `"destination": { "projectId": "...", "boardId": "..." }`
- **Fill placeholder:** adds `"destination": { "projectId": "...", "boardId": "...", "replaceSelectionId": "..." }`
- **Never sent:** `destination: null`, `destination: {}`, project-only destination, `roomId`, `createBoard`, or `sharedWithClient`

### Success display
After a successful board save:
- **Open in library** link → `/library/my-items?tab=materials&materialId={id}` (uses the full path with query params; `/library` alone is not used as its redirect drops parameters)
- **Open board** link → `{bspOrigin}{selectionPath}` (only shown when `selectionPath` starts with `/projects/` — arbitrary URLs are never opened)
- `replayed: true` is shown as "Already saved" (success, not a duplicate error)

### Error handling
- **404** — board, project, or placeholder no longer accessible; refresh destination choices (Save keeps the draft)
- **409 CONFLICT** — replacement already filled or ordered; server message shown; no silent retry
- **403 FORBIDDEN** — connection verified before concluding the key is revoked; library-only is never silently substituted without telling the user
- **Network timeout** — the exact frozen `requestId` + payload is retained; manual retry offered with the same request (no new `requestId`)

---

## Architecture

- **Service worker** (`src/service-worker/`) — handles all privileged operations: settings storage, API calls to BSP, pending candidate relay, and permission management. The connection key never leaves this context.
- **Content script** (`src/content/`) — page extraction (JSON-LD, OG meta, DOM), click-to-pick mode, and hover overlay (Shadow DOM). Never has access to the connection key.
- **Side panel** (`src/sidepanel/`) — React UI for the product form, settings, and hover controls.
- **Shadow DOM** — the hover button is rendered inside a closed Shadow DOM to prevent style conflicts with supplier pages.
