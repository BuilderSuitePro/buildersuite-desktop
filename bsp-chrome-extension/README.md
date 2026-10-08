# Builder Suite Pro – Chrome Extension (Stage 1)

A Manifest V3 Chrome extension that connects to the BSP product picker API.
Stage 1 provides the connection settings UI with real verification.

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
3. Copy each value shown on that page into the extension's Settings panel:

| Setting | Where to find it | Example format |
|---|---|---|
| **BSP Web App Origin** | The URL of your BSP web app (origin only) | `https://app.buildersuitepro.com` |
| **Verification URL** | The "Verification URL" shown on the Clipper Connect page | `https://api.buildersuitepro.com/clipper/verify` |
| **v2 Product URL** | The "Product URL" shown on the Clipper Connect page | `https://api.buildersuitepro.com/clipper/v2/products` |
| **Connection Key** | The secret bearer token shown on the Clipper Connect page | (paste as-is) |

**Security notes:**
- The Connection Key is stored only in `chrome.storage.local` on your local machine.
- It is never sent to `chrome.storage.sync`, never appears in the page DOM, and never flows through content scripts.
- It only leaves the extension as an `Authorization: Bearer …` header sent directly to your Verification URL.

---

## Host Permissions

Because the BSP API origin is user-configured (not hardcoded), this extension uses
`optional_host_permissions: ["https://*/*"]` rather than a fixed host list.

**Trade-off:** This means Chrome will prompt you to grant host access the first time you
verify, or you can pre-grant it via `chrome://extensions → BSP → Permissions`.
This is preferable to hardcoding BSP hostnames, which would break self-hosted instances.

---

## Project Structure

```
bsp-chrome-extension/
├── manifest.json              Extension manifest (Manifest V3)
├── src/
│   ├── types/index.ts         Shared TypeScript types
│   ├── shared/validation.ts   Pure validation functions (no chrome API)
│   ├── service-worker/
│   │   ├── index.ts           Message router (trusted context only)
│   │   ├── api.ts             Network fetch to BSP verify endpoint
│   │   └── storage.ts         chrome.storage.local read/write
│   ├── sidepanel/
│   │   ├── index.html         Side panel HTML entry
│   │   ├── index.tsx          React root
│   │   ├── App.tsx            Top-level app shell
│   │   └── components/
│   │       ├── SettingsPanel.tsx     Settings form + save/verify actions
│   │       └── ConnectionStatus.tsx  Status indicator
│   └── content/
│       └── extract.ts         Content script stub (Stage 1: empty)
├── tests/
│   ├── settings.test.ts       Validation unit tests
│   └── api.test.ts            API parsing + security isolation tests
├── public/icons/              Extension icons (placeholder gold squares)
├── dist/                      Built extension (load unpacked from here)
├── jest.config.js
├── tsconfig.json
├── vite.config.ts
├── README.md
└── STAGE1-REPORT.md
```

---

## Stage 1 Acceptance Checklist

Items to verify manually against the real BSP backend after loading the extension:

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
