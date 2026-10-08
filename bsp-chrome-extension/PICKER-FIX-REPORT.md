# PICKER-FIX-REPORT.md

## Fix Summary

Two bugs fixed in `cursor/bsp-chrome-extension-picker-fix` branched from
`cursor/bsp-chrome-extension-redesign-61d6`.

---

## Bug 2: Nonresponsive Picker Click — Root Cause

### Specific code that was wrong

**File:** `src/service-worker/index.ts`, inside `async function handleMessage()`, case `HOVER_IMAGE_CLICKED`:

```typescript
// OLD (broken) code in handleMessage():
case "HOVER_IMAGE_CLICKED": {
    const tabId = sender.tab?.id;
    ...
    await savePendingCandidate(candidate);   // ← await FIRST — gesture context lost here

    try {
      await chrome.sidePanel.open({ tabId });  // ← called AFTER an await — Chrome rejects this silently
    } catch {
      // Side panel opening failed — candidate is stored; panel will find it on next open
      // ← Silent failure, no logging, no stored error
    }
    ...
}
```

`handleMessage` was declared `async` and awaited `savePendingCandidate(candidate)` before calling `chrome.sidePanel.open({ tabId })`. In Chrome MV3, `sidePanel.open` requires the user-gesture context to still be active. Any `await` (including awaiting a storage write) crosses an async boundary at which Chrome considers the gesture context expired. The call then silently failed inside the empty `catch {}` block with no logging or user feedback.

### What the fix does

`HOVER_IMAGE_CLICKED` is now handled entirely in the synchronous `onMessage` listener callback — NOT delegated to the `async handleMessage` function. The new handler:

1. **Sanitizes the candidate synchronously** (pure string/number coercions, no I/O)
2. **Calls `chrome.sidePanel.open({ tabId })`** with a `.catch()` — the `.catch` registers a callback but the call itself is synchronous, preserving the gesture context
3. **Calls `chrome.storage.local.set()`** synchronously (fire-and-forget) to persist the candidate
4. **Calls `sendResponse`** and returns `false` (channel closed)

Errors from `sidePanel.open` are now logged via `console.error` and stored in `bsp_side_panel_error` in `chrome.storage.local` so the panel can surface an actionable message instead of failing silently.

### Panel-ready handshake

The panel previously sent `GET_PENDING_CANDIDATE` to the SW inside a `tabs.query` callback, which added a second async round-trip. The panel now uses a two-path delivery:

- **Primary (storage direct):** On mount, `chrome.storage.local.get('bsp_pending_candidate')` — no message round-trip, fastest possible delivery. Clears the key after reading.
- **Secondary (PANEL_READY):** Panel also sends `{ type: 'PANEL_READY' }` to the SW. SW responds via `sendResponse` with the candidate from storage. Panel only applies this if the primary path didn't already deliver it (`candidateConsumedRef`).

This eliminates the race where the panel's DOM loads and listens before the SW has confirmed the candidate.

---

## Bug 1: Permission Flow — Root Cause

### Specific code that was wrong

**File:** `src/sidepanel/App.tsx`, `handleEnableHover`:

```typescript
// OLD: per-site permission, one site at a time
const handleEnableHover = async () => {
    ...
    const granted = await new Promise<boolean>((resolve) => {
      chrome.permissions.request({ origins: [`${origin}/*`] }, resolve);  // ← per-site only
    });
    if (granted) {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage({ type: "ENABLE_HOVER_ON_SITE", origin }, () => resolve());
      });
      setHoverEnabled(true);
    }
};
```

The previous design required the user to enable hover picking **per-site** (one origin at a time). The panel showed "Enable hover picking on this site" — the user had to click Enable on every new website. This also required the user to already have the panel open on that specific site.

### What the fix does

The banner is replaced with a **single one-time "Enable automatic picking on websites" button**. A one-sentence explanation is shown below the button before it is clicked. Once granted:

- `chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] })` is called **synchronously** inside the click handler callback (no `await` before it).
- On grant: `ENABLE_ALL_SITES` message is sent to the SW.
- SW: saves `allSitesEnabled: true` in storage, calls `chrome.scripting.registerContentScripts` with the `bsp-hover-all-sites` ID for persistent MV3 registration (survives SW restart), and enables hover on all currently-open web tabs.
- On subsequent SW startup: checks `allSitesEnabled` + `chrome.permissions.contains` and re-registers. If permission was revoked externally, clears the stale flag.
- `chrome.permissions.onRemoved`: clears `allSitesEnabled` when the user revokes the permission from `chrome://extensions`.
- `GET_HOVER_SITE_STATE` now also returns `isEnabled: true` when `allSitesEnabled` is set and permission is confirmed, so existing content scripts on loaded tabs activate correctly.

---

## Manifest Verification

`manifest.json` was verified to already have all required fields:

| Field | Status |
|---|---|
| `"side_panel": { "default_path": "..." }` | ✓ Present |
| `"sidePanel"` in `permissions` | ✓ Present |
| `content_scripts` with hover/extract entry | ✓ Present |
| `optional_host_permissions: ["https://*/*", "http://*/*"]` | ✓ Present (MV3 correct form for Chrome 116+) |

No manifest changes were needed.

---

## Test Results

**Original tests:** 218 passed, 0 failed  
**New tests (`tests/permission-flow.test.ts`):** 32 added  
**Total:** 250 passed, 0 failed  
**Build:** Clean (`npm run build` — 0 errors, 0 warnings)

New test suites cover:
- All-sites permission state resolution (flag + permission matrix)
- Permission request origins correctness
- Panel-ready handshake primary/secondary delivery
- Call-order invariant: `sidePanel.open` before `storage.set`
- Content script sender validation in all-sites context
- `optional_host_permissions` config correctness
- `sidePanel.open` error visibility
- `registerContentScripts` idempotency / already-registered error detection

---

## Verification Steps

**Note:** These steps require loading the extension unpacked in real Chrome. The environment does not have a Chrome browser available for automated GUI testing. The steps are documented as they should be executed and what the expected outcome is based on the code analysis.

### Step 1: Load extension unpacked

Load the `bsp-chrome-extension` folder (or `dist/`) in Chrome (`chrome://extensions` → "Load unpacked").

**Expected:** Extension loads without errors. Toolbar icon appears.

### Step 2: Click "Enable automatic picking on websites"

Open the BSP side panel. The banner should show "Enable automatic picking on websites" with the one-sentence explanation: "This allows the BSP picker button to appear automatically on product images across any website you visit."

Click "Enable".

**Expected:** Chrome permission dialog appears requesting access to `http://*/*` and `https://*/*`.

### Step 3: Grant the permission

Click "Allow" in the Chrome dialog.

**Expected:** Banner changes to "Automatic picking is ON" with a "Disable" button.

### Step 4: Visit product pages (3 different websites)

Navigate to 3 different e-commerce sites (e.g., IKEA, Home Depot, Wayfair). Hover over product images ≥ 150×150 px.

**Expected:** BSP hover button appears on eligible product images without any further prompts.

### Step 5: Restart Chrome

Quit and relaunch Chrome. Visit a product page.

**Expected:** BSP hover button still appears. No re-prompt. (The `allSitesEnabled` flag + `registerContentScripts` persistent registration restore the state on SW startup.)

### Step 6: Click the hover button — side panel opens with product

Hover over a product image and click the BSP button.

**Expected:** Side panel opens AND the clicked product's image URL, title (if extractable), and source URL appear pre-populated in the form. The candidate is delivered via the `bsp_pending_candidate` storage key read on mount.

### Step 7: Conflict dialog — click a different product with a dirty draft

In the panel, enter some text in the Title field (making the draft "dirty"). Then on a DIFFERENT website, click the BSP hover button.

**Expected:** A conflict dialog appears in the panel asking whether to start a new capture or keep the current draft. The draft is not silently overwritten.

### Step 8: Settings still work

Open the ⋮ menu → Settings. Verify that connection settings are still present and verification still works.

**Expected:** Settings panel loads, connection URL fields and verification button are functional.

### Step 9: Save a product to library

Fill in the product form fields and click Save.

**Expected:** Product saves successfully to BSP. No regressions in the save flow.

---

## Remaining Limitations

1. **Chrome-protected pages** (`chrome://`, `chrome-extension://`, Chrome Web Store): The hover button cannot appear there by design — Chrome does not allow content scripts on those pages. The panel shows "Page picking is unavailable here. Enter product details manually." for those URLs.

2. **Already-open tabs before permission is granted:** Tabs that were open before the all-sites permission was granted receive an ENABLE_HOVER message from the SW. If the content script is not yet running in those tabs (first load after permission grant), the SW also calls `chrome.scripting.executeScript` to inject the content script files directly. New page loads after the grant always have the content script running via the manifest static entry or the `registerContentScripts` persistent registration.

3. **`sidePanel.open` user-gesture requirement:** The Chrome documentation indicates that `sidePanel.open` must be called from a user gesture. The onMessage listener receiving a content-script message that was triggered by a user click is treated by Chrome as a user-gesture context. This is the documented correct pattern for opening the side panel in response to user interactions in content scripts. If future Chrome versions change this behavior, the extension would need to use `chrome.sidePanel.setOptions({ enabled: true })` or a different approach.

4. **Per-site granted origins are still honored:** Existing per-site grants (from before this update) are preserved in storage and honored by `GET_HOVER_SITE_STATE` and `tabs.onUpdated`. The new UI no longer exposes the per-site grant flow, but old grants remain functional.

5. **No automated UI test:** Verification steps 1–9 above require manual execution in a real Chrome browser. The automated tests cover the logic layer but cannot test the actual `chrome.sidePanel.open`, `chrome.permissions.request`, or DOM overlay behaviors in a headless environment.
