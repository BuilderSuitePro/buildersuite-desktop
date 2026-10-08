# Stage 3 — Stored Image Uploads & Attachments

## What Was Built

### Upload Flow (4-step contract, exactly as specified)

**A. Local validation**
- File must be non-empty and ≤ 10 MiB (10,485,760 bytes)
- Images: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Attachments: above + `application/pdf`
- SVG, HEIC/HEIF, AVIF rejected with descriptive conversion instructions
- Filename: trimmed length 1–255, no control characters, no slash/backslash

**B. SHA-256 computation**
- Uses `window.crypto.subtle.digest('SHA-256', fileBytes)` in the side panel
- Encodes 32 digest bytes as standard RFC 4648 base64 with padding (always 44 chars ending in `=`)
- NOT hex, NOT base64url — verified by known test vectors in `tests/upload.test.ts`

**C. Begin via service worker**
- Side panel → SW: `BEGIN_UPLOAD` message `{kind, name, sha256}`
- SW calls `POST /clipper/v2/products` with `{"operation":"begin","kind":"image","name":"...","sha256":"..."}`
- BSP auth header attached by SW (connection key never leaves SW context)
- Returns `{uploadId, uploadUrl}`

**D. Ticket persisted immediately** (before bytes sent)
```json
{ "uploadId": "...", "uploadUrl": "...", "storageId": null, "sha256": "...", "name": "...", "kind": "image", "state": "beginning", "createdAt": 1234567890 }
```
Stored in `chrome.storage.local` under `uploadTickets` map keyed by `uploadId`.

**E. Bytes uploaded directly** (side panel → upload URL, no BSP credentials)
- `XHR.send(bytes)` with `Content-Type: file.type`
- No `Authorization` header — BSP credentials are never sent to storage/CDN URLs
- Progress tracked via `xhr.upload.onprogress` → per-slot progress bar

**F. Finish via service worker**
- SW calls `POST /clipper/v2/products` with `{"operation":"finish","uploadId":"...","storageId":"..."}`
- Ticket state updated to `"ready"` on success

### Interruption Recovery

On side panel load, tickets in state `"uploaded-awaiting-finish"` with a non-null `storageId` are surfaced in a recovery banner. User can:
- **Retry**: calls `FINISH_UPLOAD` via SW with the existing `uploadId` + `storageId` — no re-upload of bytes
- **Dismiss**: hides the banner (ticket remains in storage for next session)

### Upload State Machine
```
local → beginning → uploading → uploaded-awaiting-finish → ready → attached
                ↘              ↘                         ↘       ↘
              cleanup-needed  cleanup-needed           cleanup-needed
```

All transitions are validated. `attached` and `cleanup-needed` are terminal states.

### Image Slot UI (5-slot grid)

Each slot supports three actions:
- **Upload image** → file picker → full upload flow with per-slot progress (validating → hashing → uploading N% → ready)
- **Add image URL** → existing external URL field (unchanged from Stage 2)
- **Pick from page** → existing click-to-pick mode (unchanged from Stage 2)

Slot rendering order: uploaded images first (by `imageUploadIds` order), then external URLs.

Cover badge follows backend rule exactly:
- First `storageId`-backed uploaded image wins
- External `imageUrls[0]` is cover only if no stored uploads exist
- Mixed-source info bar shown when both types are present

### Attachment Section

Replaces "Coming soon" placeholder:
- "Upload file" button (JPEG, PNG, WebP, GIF, PDF; max 10 MB)
- Per-attachment row: filename, state badge, upload %, remove button
- Count badge on accordion header
- Max 10 attachments enforced before file picker opens

### Save Integration

- `uploadIds` collected at save time: only `"ready"` tickets, images first (slot order) then attachments, no duplicates, max 15
- `uploadIds` are **ticket IDs** (`uploadId` values), NOT `storageId` values
- Save button blocked while any ticket for this form is in `beginning`, `uploading`, or `uploaded-awaiting-finish`
- After confirmed save success: all included tickets updated to `"attached"` state
- After unknown outcome: tickets NOT cleared (safe retry with frozen payload)

### Discard Flow

- Remove button on ready images/attachments calls `DISCARD_UPLOAD` via SW
- `discarded: false` is shown truthfully (ambiguous — not proven deletion)
- On draft clear: best-effort discard for all ready tickets; `cleanup-needed` if ambiguous
- Attached tickets are never discarded

---

## Manual Test Steps Against Real BSP Backend

To fully test upload → save → verify:

1. Load extension in Chrome (`npm run build` → Load unpacked → `dist/`)
2. Configure: Settings → enter BSP origin, verify/product URLs, connection key → Save → Verify
3. Navigate to any product page on a supplier site
4. Open side panel, fill in product title + source URL
5. Click **Add image** in any slot → **Upload image** → select a JPEG/PNG (< 10 MB)
   - Observe: validating → hashing → uploading (progress bar) → ready state
   - Image thumbnail appears in slot with "Cover" badge on first upload
6. Open Attachments accordion → click **+ Upload file** → select a PDF
   - Observe: state badge changes: Starting → Processing → Ready
7. Click **Save to Library**
   - Observe: "Saving…" → "Saved to library!" → "Open in library" link
8. In BSP Library: verify the product appears with the uploaded image and PDF attachment
9. Test interruption recovery:
   - Open DevTools → Application → Service Workers → "Stop" to simulate SW restart
   - After upload bytes complete but before finish, close/reopen panel
   - Recovery banner should appear with "Retry" option
10. Test discard: remove a ready-uploaded image before saving → confirm "Upload removed" or ambiguous result displayed honestly
11. Test limits: attempt to upload 6th image → should be rejected with "Maximum 5 uploaded images reached"

---

## Stage 3 Acceptance Checklist

| Item | Status |
|---|---|
| File validation: MIME, size, filename | ✅ Implemented + unit tested |
| SHA-256 standard base64 (44 chars, +/= charset) | ✅ Implemented + known-vector tests |
| SVG/HEIC/AVIF rejected with descriptive error | ✅ Implemented |
| begin → persist ticket → upload bytes → finish flow | ✅ Implemented |
| BSP credentials NOT sent to upload URLs | ✅ XHR has no Authorization header |
| Ticket persisted before bytes sent | ✅ SW persists on begin response |
| Per-slot upload progress (%) | ✅ XHR upload.onprogress |
| Upload state machine transitions | ✅ Implemented + unit tested |
| Interruption recovery banner | ✅ Shown on panel load for awaiting-finish tickets |
| Recovery retry with same uploadId + storageId | ✅ No re-upload |
| Cover badge follows backend rule | ✅ First storageId-backed upload wins |
| External URL cover only if no stored uploads | ✅ computeCoverSource() |
| Mixed-source cover explanation | ✅ Info bar shown |
| Attachment section (real, not placeholder) | ✅ Implemented |
| Max 5 image uploads enforced | ✅ Checked before upload |
| Max 10 attachments enforced | ✅ Checked before upload |
| uploadIds = ticket IDs (not storageId) | ✅ Verified + unit tested |
| No duplicate uploadIds | ✅ buildUploadIds deduplicates |
| Max 15 uploadIds in save payload | ✅ Sliced in buildUploadIds + buildSavePayload |
| Save blocked during in-progress uploads | ✅ hasInProgressUploads guard |
| After save success: tickets marked attached | ✅ updateTicket for all included IDs |
| discard: false = ambiguous (not claimed as success) | ✅ cleanup-needed state used |
| Never discard attached tickets | ✅ Guard in handleRemoveUpload |
| After unknown save outcome: tickets NOT cleared | ✅ Frozen payload retry pattern |
| On draft clear: discard ready tickets | ✅ handleClearDraft iterates |
| 250 existing tests still passing | ✅ 250 pass |
| New Stage 3 tests (97 new = 347 total) | ✅ 97 new tests |
| npm run build clean | ✅ No errors |
| Manual test against real BSP backend | Pending browser test |

---

## Known Limitations

### Orphaned bytes (most important)

If `finish` fails repeatedly and the user dismisses the recovery banner, the bytes uploaded to the storage server remain there indefinitely ("orphaned"). There is no client-side deletion endpoint for the raw storage location. To recover:
- Retry the `finish` step (recovery banner handles this)
- Contact BSP support if finish is permanently unreachable

The extension is honest about this: it never claims cleanup succeeded when the outcome is ambiguous, and the recovery banner explicitly states "bytes may be orphaned on the storage server."

### Lost begin response (no uploadId)

If the `begin` API call succeeds server-side but the response is lost (SW restart during the request), no uploadId is stored. The extension shows an error and requires the user to restart the upload from scratch. No blind retry of `begin` is attempted (could create a duplicate upload).

### SW restart during upload bytes

The service worker may be restarted by Chrome during a long upload. The bytes are uploaded directly from the side panel (not via SW), so SW restarts do not interrupt the upload itself. Only the `begin` and `finish` steps go through the SW.

### No chunked upload or resume

Uploads are single POST operations. If the network drops mid-upload, the entire upload must restart from the begin step.

### Preview URL lifecycle

Object URLs created for local image previews (via `URL.createObjectURL`) are revoked on component unmount. If the panel is closed and reopened, only the external URL or the already-processed BSP URL would be available (the local object URL is gone). The slot will show a placeholder until the user re-uploads or the ticket includes a downloadable URL.

### storageId lookup

There is no endpoint to look up a `storageId` by `uploadId`. If the `uploaded-awaiting-finish` ticket is lost from `chrome.storage.local` (e.g., storage was manually cleared), the bytes cannot be finished and are effectively orphaned.
