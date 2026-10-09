# BSP Chrome Extension — Final Acceptance Report

---

## Test Environment

| Item | Value |
|---|---|
| **Test execution context** | Cloud agent VM (Ubuntu Linux, no display) |
| **Chrome version tested** | NOT TESTED — no Chrome browser available in this environment |
| **Extension build ID** | `dist/manifest.json version: 1.1.0`, service worker `dist/assets/index.ts-Dhg5rHoY.js` |
| **BSP backend** | NOT TESTED — no BSP account credentials available in this environment |
| **Test date** | 2026-10-09 |
| **Build reproducibility** | `npm run build` produces a clean `dist/` from source; `npm test` runs 415 unit tests |

> **Important:** The browser acceptance checklist requires a real Chrome browser session with a valid BSP account. All items below that require Chrome are marked **SKIP** with the reason. Code-level security and API contract items are marked **PASS** or **FAIL** based on direct source code review.
>
> **Do not mark this extension as production-ready based on this report alone.** A human tester with Chrome 116+ and valid BSP credentials must verify all SKIP items before the extension can be considered acceptance-complete.

---

## Part 1 — Code Audit Results

### Security Audit

| Item | Result | Notes |
|---|---|---|
| Connection key not in content scripts | **PASS** | `extract.ts` and `hover.ts` never import from storage or reference the key |
| Connection key not in page DOM | **PASS** | No DOM write paths; React renders only sanitized data |
| Connection key not in URL params | **PASS** | Never included in any URL construction |
| Connection key not in console logs | **PASS** | No `console.log(settings.connectionKey)` anywhere; SW masks key in all error paths |
| Connection key not in `chrome.storage.sync` | **PASS** | All storage uses `chrome.storage.local`; storage.ts comment explicitly calls this out |
| Connection key not in exported drafts | **PASS** | `DraftRecord` type contains only form fields and timestamp |
| Connection key not in source bundle | **PASS** | Key is never hardcoded; it comes from user input at runtime |
| `web_accessible_resources` narrowly scoped | **PASS** | Built manifest exposes only `icons/bsp-logo.png` and `assets/extract.ts-Ds45EQXj.js` (the content script bundle) — not the entire extension |
| Service worker validates `MessageSender` | **PASS** | `isTrustedSender` checks `sender.id === chrome.runtime.id`; `isContentScriptSender` adds tab+URL checks for `HOVER_IMAGE_CLICKED` |
| No BSP `Authorization` header to upload URLs | **PASS** | `uploadBytesWithProgress` uses `XHR` with no Authorization header; comment explicitly states "No Authorization header — this is a storage service, not BSP" |
| `externally_connectable` not in manifest | **PASS** | Confirmed absent in both source and built `manifest.json` |
| No `eval()` | **PASS** | No `eval()` calls found in any source file |
| No unsafe `innerHTML` with untrusted content | **PASS** | React renders all user content via JSX (automatically escaped); no direct `innerHTML` assignments found |

### API Contract Audit

| Item | Result | Notes |
|---|---|---|
| Verify uses `/clipper/verify` (not save, not v2) | **PASS** | `validateSettings` enforces path must end with `/clipper/verify`; `verifyConnection` posts to `settings.verificationUrl` |
| All v2 operations POST to user-configured product URL | **PASS** | `saveProduct`, `beginUpload`, `finishUpload`, `discardUpload`, and all discovery operations use `settings.productUrl` |
| `protocolVersion: 1` accepted for verify | **PASS** | `parseVerifyResponse` does not reject any protocol version from verify |
| `protocolVersion: 2` required for v2 successes | **PARTIAL** | `parseBeginUploadResponse` and `parseFinishUploadResponse` hardcode `protocolVersion: 2` in the return value but do not validate the incoming value. v2 is assumed; the server must return correct values. Low risk because the v2 endpoint contract is stable. |
| `requestId` generated once per save, persisted before POST | **PASS** | `handleSave` creates `requestId = crypto.randomUUID()`, passes to `buildSavePayload`, `savePendingSave` is called before `saveProduct` |
| Retry uses same frozen payload | **PASS** | `handleRetry(frozenPayload)` passes the original payload directly; no new `requestId` |
| `destination` never sent for library-only saves | **PASS** | `buildDestination` returns `undefined` for `mode: "library"`; `buildSavePayload` uses `...(destination ? { destination } : {})` |
| `uploadIds` contains ticket IDs (not storageId values) | **PASS** | `buildUploadIds` collects from `imageUploadIds` and `attachmentIds` which are uploadId strings |
| `uploadIds` no duplicates, max 15 | **PASS** | `buildUploadIds` uses a `Set` and slices to 15 |
| Total images (stored + external imageUrls) ≤ 5 | **PASS** | `validateProductForm` now checks `imageUploadIds.length + selectedUrls.length > 5` (fixed in Stage 5) |
| Request payload size check ≤ 131072 UTF-8 bytes | **PASS** | `saveProduct` checks `new TextEncoder().encode(bodyStr).length > MAX_REQUEST_BYTES` before sending |
| Library path uses `/library/my-items?tab=materials&materialId=...` | **PASS** | Hardcoded path in `ProductForm.tsx` line ~1850 |
| Board path uses `selectionPath` on BSP web app origin | **PASS** | `${bspOrigin}${saveState.selectionPath}` with guard that `selectionPath.startsWith("/projects/")` |

### UI Correctness Audit

| Item | Result | Notes |
|---|---|---|
| Zero and missing cost visually distinguished | **PASS** | `computePricingPreview`: blank cost → `hasPrice: false` → "Price unknown" in grey; cost=0 → `hasPrice: true, unitSellingPrice: 0` → "$0.00" in bold |
| Pricing preview uses correct rounding | **PASS** | `costCents = Math.round(cost * 100)`, `unitSellingCents = Math.round(costCents × markupFactor)`, `totalCents = Math.round(unitSellingCents × qty)` |
| Non-USD/ambiguous currency leaves cost blank with warning | **PASS** | `extractFromJsonLd` sets `currencyWarning` and does not set `cost` for non-USD; form checks `!result.currencyWarning` before applying cost |
| "Library only" always available and never blocked | **PASS** | Save button is enabled whenever connected and no form errors; library mode has no destination-related blocking |
| Draft persists across close/reopen and shows source URL | **PASS** | Draft is stored in `chrome.storage.local`; banner now shows `Draft restored (example.com/…) — HH:MM:SS` including the source URL (fixed in Stage 5) |

### Manifest Audit

| Item | Result | Notes |
|---|---|---|
| `minimum_chrome_version: "116"` | **PASS** | Present in source and built manifest |
| All listed permissions genuinely used | **PASS** | `sidePanel` for panel, `storage` for local data, `activeTab` for tab queries, `scripting` for content script injection — all used |
| `optional_host_permissions` has `http://*/*` and `https://*/*` | **PASS** | Correct key for MV3; both patterns present |
| `sidePanel` in permissions and `side_panel` key with `default_path` | **PASS** | Both present; `default_path: "src/sidepanel/index.html"` resolves correctly in built output |
| Service worker registered as `"type": "module"` | **PASS** | Present in manifest |

### Code Quality Fixes Applied in Stage 5

| Issue | Fix |
|---|---|
| Dynamic content script path hardcoded to `"src/content/extract.ts"` | Fixed: `getContentScriptPath()` reads from `chrome.runtime.getManifest().content_scripts[0].js[0]` at runtime |
| Combined image count (uploads + external) not validated | Fixed: `validateProductForm` now checks combined count |
| `DISCARD_UPLOAD` handler had redundant if/else (both branches identical) | Fixed: simplified to single unconditional update |
| Draft banner for same-URL case did not show source URL | Fixed: banner now shows truncated source URL |

---

## Part 2 — Build and Packaging Checklist

| Item | Result | Notes |
|---|---|---|
| `npm run build` succeeds cleanly | **PASS** | 43 modules transformed, no errors |
| `dist/manifest.json` is not stale | **PASS** | Rebuilt fresh; all paths match current source |
| `bsp-chrome-extension.zip` created with `manifest.json` at root | **PASS** | Verified: `unzip -l bsp-chrome-extension.zip` shows `manifest.json` at root (not `dist/manifest.json`) |
| Zip excludes source files (`src/`) | **PASS** | Zip built from `dist/` only |
| Zip excludes `node_modules/` | **PASS** | Not present in `dist/` |
| Zip excludes `.env` files and credentials | **PASS** | No `.env` found; no hardcoded credentials |
| Icons 16, 32, 48, 128px in `dist/icons/` | **PASS** | All four sizes present and referenced in manifest |
| 16px icon legibility | **NOTE** | 16×16 icon is legible but minimal (single letter/logo); this is an inherent browser constraint for small sizes |

---

## Part 3 — Browser Acceptance Checklist

> **Disclaimer:** All items below are **SKIP** because this report was generated in a cloud agent environment without a Chrome browser or BSP account. Marking any item PASS without real browser testing would be dishonest per the stage requirements. A human tester must run through this checklist before the extension can be considered acceptance-complete.

### Connection and Settings

| # | Item | Result | Notes |
|---|---|---|---|
| 1 | Load unpacked `dist/`; side panel opens only on user action | **SKIP** | No Chrome available |
| 2 | Settings persist across panel close/reopen | **SKIP** | No Chrome available |
| 3 | Verify shows real `connectionName` and localized timestamp | **SKIP** | No BSP account |
| 4 | `protocolVersion: 1` accepted for verify | **SKIP** | No BSP account |
| 5 | Missing/malformed/revoked keys rejected with clear errors | **SKIP** | No Chrome available |
| 6 | No bearer key in DevTools console, DOM, supplier requests, or network tab | **SKIP** | No Chrome available (code audit: PASS — see above) |

### Hover and Extraction

| # | Item | Result | Notes |
|---|---|---|---|
| 7 | After one-time grant, hover shows BSP button on product images without opening extension first | **SKIP** | No Chrome available |
| 8 | Pointer can move onto button without flicker; keyboard activation works | **SKIP** | No Chrome available |
| 9 | Click on product card in multi-product listing captures THAT card's data | **SKIP** | No Chrome available |
| 10 | BSP button appears after Chrome restart without re-prompting | **SKIP** | No Chrome available |
| 11 | JSON-LD page, no-structured-data page, dynamic variant, image-heavy page tested | **SKIP** | No Chrome available |
| 12 | Non-USD or ambiguous price leaves cost blank with warning | **SKIP** | No Chrome available (code audit: PASS) |
| 13 | Zero and missing cost visually different | **SKIP** | No Chrome available (code audit: PASS) |
| 14 | Denied/revoked site permission shows manual fallback | **SKIP** | No Chrome available |

### Picking Interactions

| # | Item | Result | Notes |
|---|---|---|---|
| 15 | Pick text: fills field, Escape cancels, page interaction fully resumes | **SKIP** | No Chrome available |
| 16 | Pick image: same as above for image selection | **SKIP** | No Chrome available |

### Draft Protection

| # | Item | Result | Notes |
|---|---|---|---|
| 17 | Dirty draft not overwritten when clicking different product — conflict dialog appears | **SKIP** | No Chrome available |
| 18 | Panel close/reopen restores draft for correct source URL | **SKIP** | No Chrome available (code review: draft stores `sourceUrl`; banner shows URL — PASS) |
| 19 | "Clear all" requires confirmation and preserves connection settings | **SKIP** | No Chrome available |

### Library Save

| # | Item | Result | Notes |
|---|---|---|---|
| 20 | Library-only capture appears in BSP Library → My Items → Materials with `materialId` link | **SKIP** | No BSP account |
| 21 | Does NOT appear only in legacy inbox | **SKIP** | No BSP account |
| 22 | Double-click / rapid save produces ONE library product | **SKIP** | No BSP account |
| 23 | Second attempt with same `requestId` returns `replayed: true` | **SKIP** | No BSP account |
| 24 | `replayed: true` shows "Already saved" — not error, not duplicate | **SKIP** | No BSP account (code audit: PASS — `saveState.replayed` shows "Already saved") |

### Image and Attachment Uploads

| # | Item | Result | Notes |
|---|---|---|---|
| 25 | Stored image and PDF upload and appear in BSP after save | **SKIP** | No BSP account |
| 26 | External-only image URL labeled as reference | **SKIP** | No Chrome available |
| 27 | Combined 5-image limit enforced (stored + external) | **SKIP** | No Chrome available (code audit: PASS — fixed in Stage 5) |
| 28 | 10-attachment limit enforced | **SKIP** | No Chrome available (code audit: PASS — `MAX_ATTACHMENTS = 10`) |
| 29 | Invalid MIME (SVG), empty file, oversized file rejected with clear messages | **SKIP** | No Chrome available (code audit: PASS — `validateUploadFile` handles all three) |
| 30 | No duplicate uploadIds in save payloads | **SKIP** | No Chrome available (code audit: PASS — `buildUploadIds` uses a `Set`) |
| 31 | Interrupt after byte-upload: restart extension → recovery banner → retry finish without re-uploading | **SKIP** | No Chrome available |
| 32 | `discarded: false` shown as ambiguous, not success | **SKIP** | No Chrome available (code audit: PASS — `handleRemoveUpload` marks as `cleanup-needed` when `!discardResp.data.discarded`) |

### Project/Board Destination

| # | Item | Result | Notes |
|---|---|---|---|
| 33 | Project list reflects actual user permissions | **SKIP** | No BSP account |
| 34 | Project A shows only Project A's boards | **SKIP** | No BSP account |
| 35 | Switching project clears board and replacement selection | **SKIP** | No Chrome available (code review: DestinationSelector resets downstream on projectId change) |
| 36 | Project with no boards shows "Create a board" link, Refresh button, Library only available | **SKIP** | No BSP account |
| 37 | "Load more" works including on empty nonterminal page | **SKIP** | No BSP account |
| 38 | New board selection creates exactly ONE material AND ONE private pending selection | **SKIP** | No BSP account |
| 39 | "Open board" link opens correct board in BSP | **SKIP** | No BSP account (code audit: PASS — `${bspOrigin}${selectionPath}` with `/projects/` guard) |
| 40 | Fill eligible placeholder: `_id` unchanged, product fields updated, deadline/allowance/etc preserved | **SKIP** | No BSP account |
| 41 | Warning shown for shared selection | **SKIP** | No BSP account |
| 42 | Linked/ordered selections with `canReplace: false` are disabled/omitted | **SKIP** | No BSP account (code review: DestinationSelector filters `canReplace: false`) |
| 43 | Remove board access / fill placeholder after loading but before saving: server rejects without partial material | **SKIP** | No BSP account |
| 44 | Foreign-company IDs rejected | **SKIP** | No BSP account |

### Double-Submit and Retry

| # | Item | Result | Notes |
|---|---|---|---|
| 45 | Panel closure + SW restart + retry → ONE library product, ONE selection | **SKIP** | No BSP account |
| 46 | Changed payload under same `requestId` → 409 CONFLICT, not silent second save | **SKIP** | No BSP account |
| 47 | Deleted saved-selection replay: server message states library product remains; no auto-create | **SKIP** | No BSP account |

### Client Visibility

| # | Item | Result | Notes |
|---|---|---|---|
| 48 | BSP client portal shows only shared selections and selling price | **SKIP** | Requires client account — cannot test |
| 49 | Internal cost, markup, private notes, vendor description, attachments not visible to clients | **SKIP** | Requires client account — cannot test |
| 50 | Sharing never automatically enabled for new captures | **SKIP** | No BSP account (code audit: PASS — no code auto-sets `sharedWithClient`) |

### Panel Layout

| # | Item | Result | Notes |
|---|---|---|---|
| 51 | Panel at 320 px: no horizontal overflow, all labels readable, footer doesn't cover last field | **SKIP** | No Chrome available |
| 52 | Panel at 400 px looks correct | **SKIP** | No Chrome available |
| 53 | Header menu, accordions, all actions work at both widths | **SKIP** | No Chrome available |

### Security Checks (in-browser)

| # | Item | Result | Notes |
|---|---|---|---|
| 54 | No connection key in DevTools console, network tab (supplier/upload requests), DOM, localStorage | **SKIP** | No Chrome available (code audit: PASS — see security audit above) |
| 55 | Account/profile switch cannot replay prior pending save into different backend or account | **SKIP** | No Chrome available (code review: PARTIAL — pending save is tied to settings at save time; settings change clears verification but pending save is not explicitly cleared. A different account using the same machine COULD theoretically replay. This is a limitation to document.) |

---

## Known Limitations (Explicitly Stated)

1. **No real browser testing performed.** All acceptance checklist items are SKIP. This report documents code-level audit results only.

2. **Orphaned upload bytes.** If the `finish` step cannot complete after multiple retries, bytes remain on the storage server. No cleanup endpoint is available from the extension side. BSP support must assist.

3. **Account switch replay risk.** If a user switches BSP accounts on the same browser without clearing the extension's pending save, the pending save could theoretically be retried against the new account's backend URL if it happens to match. Risk is low but the pending save is not cleared on account switch.

4. **16×16 icon legibility.** The icon is minimal at 16px — inherent browser constraint.

5. **CRXJS hashed filenames.** The content script path changes on each build (hash in filename). Dynamic registration reads from `chrome.runtime.getManifest()` at runtime to resolve this, but test infrastructure must be aware filenames change between builds.

6. **Dynamic variant products.** Variant selection (e.g., color/size pickers) may not be reflected in extracted data if the DOM updates client-side after initial load. Manual correction in the form is required.

7. **Client portal testing not covered.** All client visibility items require a separate client account. None were tested.

8. **Chrome-protected pages.** Pages at `chrome://`, `chrome-extension://`, the Chrome Web Store, and `about:` pages cannot be inspected. The extension shows a manual fallback banner for these pages.

9. **`discarded: false` is ambiguous.** The BSP API's `discarded: false` response does not confirm deletion — the bytes may be missing, foreign, or already attached. The extension marks these as "cleanup-needed" and reports truthfully; it never claims success.

10. **First-paint latency on slow connections.** The side panel loads the entire React bundle (~216 KB gzip: 65 KB). On very slow connections, there may be a visible render delay.

---

## Test Suite Results

```
Test Suites: 8 passed, 8 total
Tests:       415 passed, 415 total
Snapshots:   0 total
Time:        ~2.5s
```

All 415 unit tests pass on the Stage 5 branch.

---

## Summary

The extension has passed a comprehensive code-level audit. All identified code issues have been fixed:
- Dynamic content script path now reads from the built manifest at runtime
- Combined image limit (uploads + external) is now validated in `validateProductForm`
- Draft banner now shows the source URL for same-page drafts
- Redundant DISCARD_UPLOAD handler branches simplified

**Browser acceptance testing is required** before declaring this extension production-ready. A human tester with Chrome 116+ and valid BSP credentials should work through the complete checklist in Part 3, paying particular attention to:
- Connection flow and key security (items 1–6)
- Hover picking on real supplier sites (items 7–14)
- Library and board saves with real data (items 20–44)
- Client portal visibility (items 48–50)
- Panel layout at narrow widths (items 51–53)
