# Stage 1 Report – BSP Chrome Extension

## What Was Built

Stage 1 delivers the complete connection settings infrastructure and verification flow:

### Extension architecture
- **Manifest V3**, minimum Chrome 116, with `sidePanel`, `storage`, `activeTab`, and `scripting` permissions.
- **Service worker** (`src/service-worker/`) handles all privileged operations (storage r/w, network fetch). It validates `MessageSender.id` and `MessageSender.url` before processing any message, rejecting anything from content scripts or web pages.
- **React + TypeScript side panel** (`src/sidepanel/`) renders the settings form and connection status. Communicates with the service worker via `chrome.runtime.sendMessage`.
- **Content script stub** (`src/content/extract.ts`) is intentionally empty and contains no storage imports, no API references, and no credential handling. Stage 2 will add product extraction here.

### Settings form
Four fields with full inline validation:
- BSP Web App Origin (must be a valid HTTPS origin, no path)
- Verification URL (must end with `/clipper/verify`, HTTPS, no embedded credentials)
- v2 Product URL (must end with `/clipper/v2/products`, HTTPS, no embedded credentials)
- Connection Key (masked with show/hide toggle; non-empty after trim)

Save is disabled while any field is invalid. Verify is disabled until settings are saved and the form is unmodified.

### Verification
`POST {verificationUrl}` with `Authorization: Bearer {key}`, `credentials: omit`, `redirect: error`. Accepts `protocolVersion: 1` — this is correct by design. On success displays `connectionName` and a localized last-checked timestamp. On failure displays the error message.

Any field edit after a verified state resets the status to "Not verified" immediately (both in React state and via `chrome.storage.local` when saved).

### Security
- Connection key stored only in `chrome.storage.local`; never in `chrome.storage.sync`, URL params, DOM, or console.
- Service worker rejects messages where `sender.id !== chrome.runtime.id` or `sender.url` is absent.
- Content script has zero access to storage or credentials.
- `redirect: error` prevents credential-bearing fetches from following redirects.

### Build & test
- **Vite + @crxjs/vite-plugin** builds a `dist/` folder ready to load unpacked.
- **38 Jest unit tests** cover validation, API response parsing, key isolation, and sender validation — all passing.

---

## Manual Testing Against the Real BSP Backend

The owner must perform these steps with actual BSP credentials:

### 1. Load the extension
1. Run `npm run build` in the project directory.
2. In Chrome, open `chrome://extensions`, enable Developer mode, click **Load unpacked**, select the `dist/` folder.
3. **Expected:** Extension appears with no errors. No background errors in the service worker DevTools.

### 2. Open the side panel
1. Click the **Builder Suite Pro** toolbar icon.
2. **Expected:** Side panel opens on the right side of the browser, showing the Connection Settings form.

### 3. Settings persist across close/reopen
1. Enter valid settings and click **Save Settings**.
2. Close the side panel (close the browser tab or the panel itself).
3. Click the toolbar icon to reopen.
4. **Expected:** All four fields are pre-filled with the saved values. Connection Key field shows `••••••` (masked).

### 4. Verify shows real connectionName and localized time
1. With valid settings saved, click **Verify Connection**.
2. **Expected (success):**
   - Status briefly shows "Verifying…"
   - Then shows green "✓ Connection verified"
   - Below it: the `connectionName` value from your BSP account
   - Below that: "Last checked: {date} at {time}" in your local format
   - DevTools → Network shows a POST to your Verification URL with status 200.

### 5. protocolVersion: 1 accepted
1. Inspect the verify response in DevTools → Network → Response.
2. **Expected:** Response contains `"protocolVersion": 1`. Extension accepts this and shows "Connection verified" (does not warn or reject).

### 6. Wrong/missing key is rejected cleanly
1. Enter any invalid key (e.g. change last character), save, verify.
2. **Expected:** Red "✗ Verification failed" with the error message from the server (e.g. "Invalid key provided" or the HTTP status). No bearer token leaks into the visible error text.

### 7. No bearer key in content scripts, DOM, or logs
1. After successful verification, open DevTools → Console on any web page.
2. Inspect the page DOM (`document.body.innerHTML`).
3. Check `chrome://extensions → BSP → Service Worker → Inspect` console.
4. **Expected:** The connection key does not appear anywhere. The word `Bearer` does not appear in the content script console.

### 8. Field edit resets verification
1. After a successful verify, change any character in any field.
2. **Expected:** Status immediately reverts to "○ Not verified" before any save or verify action.

---

## Stage 1 Checklist Status

| Item | Status |
|---|---|
| Load unpacked; side panel opens only on user action | ✅ Implemented — `chrome.action.onClicked` triggers `sidePanel.open` |
| Settings persist safely across panel close/reopen | ✅ Implemented — `chrome.storage.local` via service worker |
| Verify shows real connectionName and localized time; protocolVersion 1 accepted | ✅ Implemented — **requires browser test against real backend** |
| Missing/malformed key is rejected cleanly | ✅ Implemented — **requires browser test with wrong key** |
| No bearer key appears in content scripts, page DOM, or logs | ✅ Implemented and unit-tested — **confirm via DevTools inspection** |

The first two items are verifiable by inspection and unit tests. Items 3–5 require a live BSP backend for final confirmation.

---

## Known Limitations & Open Questions

1. **Host permissions dialog:** `optional_host_permissions: ["https://*/*"]` means Chrome may prompt the user to grant host access on first verify. If the BSP team wants to hardcode the API origin, that can be added to `manifest.json` in Stage 2.

2. **Icons are placeholder gold squares.** Replace `public/icons/icon{16,48,128}.png` with real BSP branding assets before release.

3. **Stage 2 scope not included:** Product capture form, page extraction, library capture, image uploads, and project/board selection are all deferred.

4. **`chrome.storage.local` is not encrypted at rest.** The key is protected by OS user account access, same as browser-saved passwords. This is standard for Chrome extensions.

5. **One connection per installation.** The current settings model stores a single connection. Multi-account support (if needed) is a Stage 2+ concern.
