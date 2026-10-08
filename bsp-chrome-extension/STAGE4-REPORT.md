# Stage 4 — Project → Board → Selection Destination Flow

## What Was Built

### Discovery API Calls (service worker)

Three new discovery operations POSTing to the **same** v2 Product URL (`settings.productUrl`) with `Authorization: Bearer <key>` — credentials stay entirely in the service worker:

| Operation | Body fields | Response |
|---|---|---|
| `projects` | `paginationOpts: { numItems: 25, cursor }` | `{ page: [{_id, name}], isDone, continueCursor }` |
| `boards` | `projectId + paginationOpts` | same shape |
| `selections` | `projectId + boardId + paginationOpts` | `{ page: [{_id, name, canReplace, sharedWithClient}], isDone, continueCursor }` |

**Pagination rules enforced:**
- `continueCursor` from each response is passed into the next request's `paginationOpts.cursor`
- "Load more" button shown until `isDone: true`, **including empty non-terminal pages**
- `numItems` is always an integer 1–100
- Items deduplicated by `_id` when appending pages
- Stale responses discarded via per-entity generation counters (project/board/selection each have their own)
- Upstream change (project selected) → clear all downstream state and re-fetch

### New Message Types

Added to `src/types/index.ts` and handled in `src/service-worker/index.ts`:
- `DISCOVER_PROJECTS` → calls `discoverProjects(settings, cursor)`
- `DISCOVER_BOARDS` → calls `discoverBoards(settings, projectId, cursor)`
- `DISCOVER_SELECTIONS` → calls `discoverSelections(settings, projectId, boardId, cursor)`

Status code is forwarded in the error response for 403 discrimination.

### DestinationSelector Component (`src/sidepanel/components/DestinationSelector.tsx`)

Replaces the honest "coming in a future release" placeholder in the Destination accordion.

**UI flow:**
1. **Library only** radio (default) — no API calls, no blocking
2. **Add to board** radio — triggers project list load on first open

**Project section:**
- `<select>` populated as pages load
- "Load more" button when `isDone: false`
- Refresh button (re-fetches from cursor=null)

**Board section** (visible after project selected):
- Same structure as projects
- **No-boards state** — shows message with link to `{bspOrigin}/projects/{projectId}/selections` and a "Refresh boards" button
- Save remains unblocked for library-only

**Selection section** (visible after board selected):
- "New selection" radio (default) — private, pending; info note shown about selling price and privacy
- "Fill placeholder" radio — loads `canReplace: true` selections only; ineligible ones shown disabled
- Per-selection radio with "Shared" badge on `sharedWithClient: true` items
- Replacement warning always shown when a selection is chosen
- Additional shared-client warning when `sharedWithClient: true`

### buildDestination() (`src/shared/validation.ts`)

Pure function — maps `DestinationFormState` to `SaveDestination | undefined`:
- `mode: "library"` → `undefined` (no destination field)
- `mode: "board"` + missing projectId or boardId → `undefined` (invalid state — never sends incomplete)
- `mode: "board"` + both ids → `{ projectId, boardId }`
- `mode: "board"` + fill + replaceSelectionId → `{ projectId, boardId, replaceSelectionId }`

### buildSavePayload() Updated

Accepts optional `destination?: SaveDestination` parameter. When provided, adds it to the payload using spread (`...destination ? { destination } : {}`), so the field is **absent entirely** for library-only saves (not `null`, not `{}`).

### PendingSave Updated

Stores `destination?: SaveDestination` alongside `requestId`, `product`, and `uploadIds` for safe retry of board saves with the exact same frozen payload.

### ProductForm.tsx Updates

- Imports and renders `<DestinationSelector>` inside the Destination accordion
- `destinationState` state variable tracks the current `DestinationFormState`
- **Destination badge** on the accordion header when a board is chosen
- **Blocking guard**: `destinationBlocked = mode === "board" && !!projectId && !boardId`
  - Blocks save, shows "Select a board to save to it" in both the accordion and the footer
- `handleSave()` calls `buildDestination(destinationState)` and passes result to `buildSavePayload()`
- **Success state** extended with `selectionId?: string`, `selectionPath?: string`
- Board link shown when `selectionPath?.startsWith("/projects/")` — invalid paths are never opened
- Save button label: "Save to Library & Board" when board is chosen, "Save to Library" otherwise
- New selection info shown post-save ("New selection is private. Share it with your client from the board when ready.")
- `replayed: true` shown as "Already saved" (success, not error)
- Error state extended with `is403`, `is404`, `is409` flags for specific error messaging
- **409 CONFLICT**: shows "Conflict: {message}" — no re-key and resend
- **403 FORBIDDEN**: shows "Permission error" + "Verify your connection in Settings, or switch to Library only."
- **404**: shows message + "Board, project, or placeholder may no longer exist. Refresh your destination choices."

### 403 Discrimination

When discovery returns 403:
1. `VERIFY_CONNECTION` is sent to the service worker
2. If verify succeeds: `boardSaveForbidden = true` + explanation shown; library-only fully available
3. If verify fails: error shown with reconnection prompt; **key is never auto-erased** based solely on a 403 from discovery

---

## Manual Test Steps

### Prerequisites
- Built extension loaded unpacked from `dist/`
- Valid BSP settings configured and connection verified

### Test 1: Project list loads
1. Open side panel, fill in title + source URL
2. Open **Destination** accordion → select **Add to board**
3. **Expected**: Project `<select>` shows "Loading…" briefly, then lists your projects
4. If more than 25 projects: **Load more** button appears; click to append next page
5. Click **↻ Refresh** → list re-fetches from start; no duplicates appear

### Test 2: Board list loads per project
1. After projects load, select a project from the dropdown
2. **Expected**: Board `<select>` appears below and loads boards for that project
3. Change to a different project → **Expected**: board dropdown clears and reloads for the new project

### Test 3: No-boards state
1. Select a project that has no selection boards
2. **Expected**: Instead of the board dropdown, a message appears: "This project has no selection boards." with a link opening the BSP project's Selections page and a "Refresh boards" button
3. **Expected**: Save is NOT blocked for Library only; switching to "Library only" still works

### Test 4: Selections load per board
1. Select a project → select a board
2. **Expected**: Selection section appears with "New selection" (default) and "Fill placeholder" options
3. Click "Fill placeholder" → eligible selections load (canReplace: true only)
4. Ineligible selections appear greyed out/disabled

### Test 5: New selection created with correct selling price and privacy
1. Enter cost $100 and markup 20%
2. Select a project and board, leave "New selection" selected
3. Click **Save to Library & Board**
4. In BSP on the board: the selection should appear with **selling price $120** (cost + markup), not $100
5. The selection is **private** (not visible to client); it shows "New selection is private. Share it with your client from the board when ready." in the success message

### Test 6: Placeholder replacement preserves deadline/status/decisions
1. Select a project → board → Fill placeholder → choose an eligible selection
2. Note: replacement warning "Replacing this selection updates product fields only. Deadlines, allowances, status, sharing, and client decisions are preserved." must be visible
3. If the selection has sharedWithClient: true, additional warning must be shown
4. Click **Save to Library & Board**
5. In BSP: verify the product fields (title, images, supplier) were updated
6. **Verify preserved:** deadline, allowance, responsibility, ordering position, status, prior staff notes, sharing state, client decisions/comments

### Test 7: Blocking — project chosen, no board chosen
1. Select a project, leave the board at "— Select board —"
2. **Expected**: Save button is disabled, message "Select a board to save to it" appears in footer and in the accordion

### Test 8: 403 with valid key (selections forbidden)
1. Use a connection key that has no selections permission
2. Open Destination → Add to board
3. **Expected**: Projects load fails with 403; verify is called; message "Your connection does not have access to project selections. Saving to Library only." appears
4. Library only is still available and Save button works for library save

### Test 9: Refresh button on each section
1. Load projects, load boards, load selections
2. Click **↻ Refresh** on the Projects section → re-fetches from cursor=null; no duplicates
3. After changing project, click **↻ Refresh** on Boards → re-fetches boards for current project

### Test 10: Success display with board link
1. Save a product to a board
2. **Expected**: "Saved to library & board!" appears
3. "Open in library" link points to `/library/my-items?tab=materials&materialId={id}` (with full path and params — NOT just `/library`)
4. "Open board" link appears if `selectionPath` starts with `/projects/`

---

## Acceptance Checklist

| Item | Status |
|---|---|
| Discovery API calls POST to v2 product URL with Bearer auth | ✅ Implemented |
| Key never in content scripts or page DOM | ✅ Service worker only |
| Pagination: Load more button until isDone: true | ✅ Implemented |
| Pagination: Load more shown for empty non-terminal pages | ✅ Enforced |
| Pagination: numItems is integer 1–100 (25 used) | ✅ Implemented |
| Pagination: deduplication by _id | ✅ dedupeById() |
| Pagination: stale response discard via generation counter | ✅ Implemented per-entity |
| Project change → clears board + replacement | ✅ handleProjectChange() |
| Board change → clears replacement | ✅ handleBoardChange() |
| Library-only switch → clears project, board, replacement | ✅ handleModeChange() |
| Library only radio always available | ✅ |
| No-boards message with link to BSP selections page | ✅ Uses stored bspWebAppOrigin + projectId |
| No-boards "Refresh boards" button | ✅ |
| Library-only unblocked when project has no boards | ✅ |
| Only canReplace: true selections for replacement | ✅ eligibleSelections filter |
| Ineligible selections shown disabled/omitted | ✅ Shown disabled |
| Replacement warning always shown | ✅ |
| Shared selection additional warning | ✅ selectionIsShared check |
| Refresh button per section | ✅ Projects, boards, selections |
| 403 → VERIFY_CONNECTION discrimination | ✅ handle403() |
| 403 + valid key → disable board save, keep library-only | ✅ boardSaveForbidden state |
| 403 + revoked key → reconnection prompt, no key erasure | ✅ |
| buildDestination(): library-only → no field | ✅ returns undefined |
| buildDestination(): board save → {projectId, boardId} | ✅ |
| buildDestination(): fill → {projectId, boardId, replaceSelectionId} | ✅ |
| Never sends destination: null or {} | ✅ Spread conditional |
| Never sends project-only destination | ✅ Returns undefined if boardId missing |
| Save blocked: project chosen, no board | ✅ destinationBlocked guard |
| Save button label changes for board save | ✅ "Save to Library & Board" |
| Success: replayed: true shown as "Already saved" | ✅ |
| Success: library link uses /library/my-items with materialId | ✅ NOT /library alone |
| Success: board link shown when selectionPath starts with /projects/ | ✅ Validated |
| Success: arbitrary selectionPath not opened | ✅ Starts-with check |
| Success: new selection note shown | ✅ |
| Error 404: message + refresh guidance | ✅ is404 flag |
| Error 409: conflict message shown, no re-send | ✅ is409 flag |
| Error 403: permission message + verify guidance | ✅ is403 flag |
| Network timeout: frozen requestId preserved for retry | ✅ UNKNOWN: prefix path |
| PendingSave includes destination for retry | ✅ |
| All 347 existing tests still passing | ✅ 415 total (347 + 68 new) |
| npm run build clean | ✅ |

---

## Known Limitations

### No server-side 403 status code forwarding in error string

The service worker currently forwards the 403 status code via the error message string (e.g., "Server returned 403"). The `ProductForm` detects 403/404/409 by string matching on the error message. A more robust approach would be to add a `statusCode` field to `MessageResponse`. This is a future improvement — string matching covers all expected server messages from the BSP API.

### Selections list pagination requires board re-selection to reset

If the user clicks Refresh on the selections list while a board is selected, it re-fetches from page 1. If they need to paginate and then refresh, the list correctly resets. There is no "current page" indicator.

### No prefetch on accordion open

Projects are loaded only when the user switches to "Add to board" mode. There is no background prefetch when the accordion opens in Library-only mode. This means there's a short loading delay on first switch.

### selectionPath validated by /projects/ prefix only

The `selectionPath` from the server is validated by checking that it starts with `/projects/`. This prevents opening arbitrary URLs but does not validate the full path structure. If the server sends a path starting with `/projects/` that is otherwise malformed, the link will still be constructed and displayed.

### No auto-retry of board save on 404

On a 404 response, the UI shows guidance to refresh destination choices but does not automatically reload the project/board/selection lists. The user must manually click Refresh and reselect.
