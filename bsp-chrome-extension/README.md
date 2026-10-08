# Builder Suite Pro – Chrome Extension (Stage 2)

A Manifest V3 Chrome extension that connects to the BSP product picker API.
Stage 1 provided the connection settings UI with real verification.
Stage 2 adds page extraction, a full product review/edit form, and library-only save.

---

## Requirements

- Chrome 116 or later (required for `sidePanel.open` programmatic support)
- Node.js 18+

---

## Development

```bash
cd bsp-chrome-extension
npm install       # install dependencies
npm run build     # produce dist/ (load-unpacked ready)
npm run dev       # watch mode (rebuilds on change)
npm run test      # run Jest unit tests
```

---

## Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder inside this project
5. The **Builder Suite Pro** extension will appear in your toolbar
6. Click the toolbar icon — the side panel opens on the right side

> After any code change, run `npm run build` again, then click the
> **⟳ reload** icon on the extension card in `chrome://extensions`.

---

## Configuration Guide

All values are obtained from your BSP account:

1. Log in to your BSP web app
2. Go to **Settings → Integrations → Clipper Connect** (or `/integrations/clipper/connect`)
3. Copy each value shown on that page into the extension's **Settings** tab:

| Setting | Where to find it | Example format |
|---|---|---|
| **BSP Web App Origin** | The URL of your BSP web app (origin only) | `https://app.buildersuitepro.com` |
| **Verification URL** | The "Verification URL" shown on the Clipper Connect page | `https://api.buildersuitepro.com/clipper/verify` |
| **v2 Product URL** | The "Product URL" shown on the Clipper Connect page | `https://api.buildersuitepro.com/clipper/v2/products` |
| **Connection Key** | The secret bearer token shown on the Clipper Connect page | (paste as-is) |

After saving settings, click **Verify Connection** in the Settings tab to confirm connectivity.

---

## Stage 2 Usage

### Extracting product data from a page

1. Navigate to any supplier product page in Chrome
2. Click the BSP toolbar icon to open the side panel
3. In the **Capture** tab, click **"Extract from page"**
4. Extracted fields are auto-populated (gold dot indicates auto-filled)
5. Review and edit any field — all fields are editable

**On protected pages** (chrome://, extensions, Chrome Web Store): the extension will show a message explaining it cannot inspect the page, and all fields remain blank for manual entry.

### Using Click-to-Pick

For any text or image field:
1. Click the **"Pick"** button next to the field
2. The page shows a golden banner: "Click any text/image on the page to pick it"
3. Hover over elements — a gold outline shows what will be picked
4. Click to pick; the value populates the field
5. Press **Esc** to cancel without picking

### Handling ambiguous prices

- If multiple price candidates are found, a picker appears above the form
- Click the price to use, or "Skip (enter manually)"
- If the page shows a non-USD currency, the cost field is left blank with a warning

### Saving to Library

1. Fill in at minimum: **Title** and **Source URL**
2. Optionally fill pricing, images, description, etc.
3. Select the images to include (check the checkbox on each thumbnail)
4. Click **"Save to Library"**
5. On success, a link to "Open library product" appears
6. If the outcome is uncertain (network error / 5xx), a **Retry** button appears

**Draft auto-save:** The form state is saved automatically while you work. It persists across panel close/reopen. If a draft from a different page URL exists, you will be prompted before it is replaced.

---

## Security Notes

- The Connection Key is stored only in `chrome.storage.local` on your local machine
- It is never sent to `chrome.storage.sync`, the page DOM, or content scripts
- Content scripts only extract page-visible data and return bounded results
- All text from pages is rendered as text only — never injected as HTML
- Currency ambiguity always leaves cost blank rather than silently assuming USD

---

## Host Permissions

This extension uses `optional_host_permissions: ["https://*/*"]` because the BSP API origin is user-configured. Chrome will prompt for host access on first use, or you can pre-grant it via `chrome://extensions → BSP → Permissions`.

---

## Project Structure

```
bsp-chrome-extension/
├── manifest.json              Extension manifest (Manifest V3)
├── src/
│   ├── types/index.ts         Shared TypeScript types (settings, extraction, save)
│   ├── shared/validation.ts   Pure validation + pricing math + payload builder
│   ├── service-worker/
│   │   ├── index.ts           Message router (trusted context only)
│   │   ├── api.ts             Network: verify + save product
│   │   └── storage.ts         chrome.storage.local (settings, draft, pending save)
│   ├── sidepanel/
│   │   ├── index.html         Side panel HTML entry
│   │   ├── index.tsx          React root
│   │   ├── App.tsx            Tab shell (Capture / Settings)
│   │   └── components/
│   │       ├── SettingsPanel.tsx     Settings form + verify
│   │       ├── ConnectionStatus.tsx  Status indicator
│   │       ├── ProductForm.tsx       Full product review/edit/save form
│   │       ├── ImageGallery.tsx      Thumbnail grid + add URL + pick
│   │       └── PricingPreview.tsx    Live pricing math display
│   └── content/
│       └── extract.ts         Page extraction + click-to-pick (content script)
├── tests/
│   ├── settings.test.ts       Settings validation tests (Stage 1)
│   ├── api.test.ts            API parsing + security isolation tests (Stage 1)
│   ├── extract.test.ts        Extraction logic tests (Stage 2)
│   └── product-form.test.ts   Form validation, pricing math, payload, draft (Stage 2)
├── public/icons/
├── dist/                      Built extension (load unpacked from here)
├── jest.config.js
├── tsconfig.json
├── vite.config.ts
├── README.md
├── STAGE1-REPORT.md
└── STAGE2-REPORT.md
```

---

## Stage 1 Acceptance Checklist

- [ ] Extension loads without errors in Chrome DevTools (Extensions page)
- [ ] Side panel opens only when the toolbar icon is clicked (no auto-open)
- [ ] Settings form shows four fields with correct labels and hints
- [ ] Invalid inputs show inline error messages; Save button is disabled
- [ ] Settings persist after closing and re-opening the side panel
- [ ] Verify Connection button is disabled until settings are saved
- [ ] Verify Connection button hits the network (visible in DevTools → Network)
- [ ] Successful verification shows `connectionName` from the real API response
- [ ] Last-checked time is displayed in the user's local time format
- [ ] `protocolVersion: 1` in the verify response is accepted (not rejected)
- [ ] Editing any field after a successful verify resets status to "Not verified"
- [ ] A wrong connection key shows "Verification failed" with the error message
- [ ] No bearer token appears in the page DOM, content script, or console logs

---

## Stage 2 Acceptance Checklist

- [ ] "Extract from page" button populates form fields from JSON-LD, OG, and DOM
- [ ] Auto-filled fields show a gold dot indicator
- [ ] Non-USD currency leaves cost blank and shows a warning
- [ ] Multiple price candidates surface a picker UI
- [ ] Pick-text: clicking an element on the page sets the field value
- [ ] Pick-image: clicking an image on the page adds it to the gallery
- [ ] Esc cancels pick mode cleanly
- [ ] Image gallery shows thumbnails; checkboxes select which to include
- [ ] "Add URL" adds an external image URL reference
- [ ] Pricing preview updates live with correct math (see spec example)
- [ ] Zero cost is visually distinct from blank cost
- [ ] All form fields are editable and validated with inline errors
- [ ] Save button is disabled when form has errors or no connection
- [ ] "Save to Library" posts to the v2 product endpoint with Bearer auth
- [ ] Success shows "Saved to library" with a link
- [ ] `replayed: true` shows "Already saved" (not an error)
- [ ] On 5xx/network error: "Save outcome unknown — retry?" with Retry button
- [ ] Retry uses the same requestId and frozen payload (safe idempotent retry)
- [ ] Draft persists across panel close/reopen
- [ ] Reopening on a different page URL prompts before replacing draft
- [ ] Protected pages show a helpful message, not an error
- [ ] No credentials in content script; no API keys in extraction data
