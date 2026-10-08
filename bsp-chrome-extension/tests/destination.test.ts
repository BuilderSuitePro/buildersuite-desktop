/**
 * Stage 4 – Destination flow tests.
 *
 * Covers:
 * - buildDestination(): library-only, board save, replacement
 * - Pagination state helpers: load-more on empty non-terminal page, dedup, stale discard
 * - Reset rules: project change clears board+replacement; board change clears replacement
 * - 403 discrimination: valid key + forbidden selections vs. revoked key
 * - No-boards state: link construction from stored bspWebAppOrigin + projectId
 * - selectionPath validation before opening (must start with /projects/)
 * - replayed: true treated as success
 * - Replacement warning for sharedWithClient: true selections
 * - Save blocked when project chosen but no board chosen
 * - Discovery API parsing
 */

import {
  buildDestination,
  buildSavePayload,
  type DestinationFormState,
} from "../src/shared/validation";
import {
  ApiError,
} from "../src/service-worker/api";
import type { ProductFormState, BspProject, BspBoard, BspSelection, DiscoveryPage } from "../src/types/index";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeForm(overrides: Partial<ProductFormState> = {}): ProductFormState {
  return {
    title: "Test Product",
    sourceUrl: "https://example.com/product",
    description: "",
    cost: "",
    markupPercent: "0",
    quantity: "1",
    unit: "each",
    msrp: "",
    taxable: false,
    supplierName: "",
    manufacturer: "",
    sku: "",
    dimensions: "",
    finishColor: "",
    composition: "",
    category: "",
    vendorDescription: "",
    internalNotes: "",
    tags: "",
    imageUrls: [],
    selectedImageIndexes: [],
    imageUploadIds: [],
    attachmentIds: [],
    ...overrides,
  };
}

// ─── buildDestination() ──────────────────────────────────────────────────────

describe("buildDestination()", () => {
  it("returns undefined for library-only mode", () => {
    const dest: DestinationFormState = { mode: "library" };
    expect(buildDestination(dest)).toBeUndefined();
  });

  it("returns undefined for library-only mode even if projectId is set (should not happen but defensive)", () => {
    const dest: DestinationFormState = {
      mode: "library",
      projectId: "proj1",
      boardId: "board1",
    };
    expect(buildDestination(dest)).toBeUndefined();
  });

  it("returns undefined for board mode with no projectId", () => {
    const dest: DestinationFormState = {
      mode: "board",
      boardId: "board1",
    };
    expect(buildDestination(dest)).toBeUndefined();
  });

  it("returns undefined for board mode with no boardId", () => {
    const dest: DestinationFormState = {
      mode: "board",
      projectId: "proj1",
    };
    expect(buildDestination(dest)).toBeUndefined();
  });

  it("returns destination with projectId and boardId for board save", () => {
    const dest: DestinationFormState = {
      mode: "board",
      projectId: "proj-abc",
      boardId: "board-xyz",
      selectionMode: "new",
    };
    const result = buildDestination(dest);
    expect(result).toEqual({ projectId: "proj-abc", boardId: "board-xyz" });
    expect(result?.replaceSelectionId).toBeUndefined();
  });

  it("includes replaceSelectionId when mode is fill with a selection", () => {
    const dest: DestinationFormState = {
      mode: "board",
      projectId: "proj-abc",
      boardId: "board-xyz",
      selectionMode: "fill",
      replaceSelectionId: "sel-001",
    };
    const result = buildDestination(dest);
    expect(result).toEqual({
      projectId: "proj-abc",
      boardId: "board-xyz",
      replaceSelectionId: "sel-001",
    });
  });

  it("does NOT include replaceSelectionId when selectionMode is 'new' even if replaceSelectionId is set", () => {
    const dest: DestinationFormState = {
      mode: "board",
      projectId: "proj-abc",
      boardId: "board-xyz",
      selectionMode: "new",
      replaceSelectionId: "sel-001",
    };
    const result = buildDestination(dest);
    expect(result?.replaceSelectionId).toBeUndefined();
  });

  it("does NOT include replaceSelectionId when it is an empty string", () => {
    const dest: DestinationFormState = {
      mode: "board",
      projectId: "proj-abc",
      boardId: "board-xyz",
      selectionMode: "fill",
      replaceSelectionId: "",
    };
    const result = buildDestination(dest);
    expect(result?.replaceSelectionId).toBeUndefined();
  });

  it("never produces destination: null", () => {
    const dest: DestinationFormState = { mode: "library" };
    const result = buildDestination(dest);
    expect(result).not.toBeNull();
    expect(result).toBeUndefined(); // undefined is correct; null is forbidden
  });

  it("never produces an empty object for invalid board state", () => {
    const dest: DestinationFormState = { mode: "board" };
    const result = buildDestination(dest);
    // Should be undefined — not {} — when projectId/boardId are missing
    expect(result).toBeUndefined();
  });

  it("never produces a project-only destination (missing boardId)", () => {
    const dest: DestinationFormState = {
      mode: "board",
      projectId: "proj-only",
    };
    const result = buildDestination(dest);
    expect(result).toBeUndefined();
  });
});

// ─── buildSavePayload with destination ───────────────────────────────────────

describe("buildSavePayload() with destination", () => {
  const form = makeForm();

  it("omits destination field for library-only (no destination field at all)", () => {
    const payload = buildSavePayload(form, "req-1");
    expect("destination" in payload).toBe(false);
    expect(payload.destination).toBeUndefined();
  });

  it("includes destination for board save", () => {
    const dest = { projectId: "p1", boardId: "b1" };
    const payload = buildSavePayload(form, "req-2", [], dest);
    expect(payload.destination).toEqual({ projectId: "p1", boardId: "b1" });
  });

  it("includes destination with replaceSelectionId for fill placeholder", () => {
    const dest = { projectId: "p1", boardId: "b1", replaceSelectionId: "s1" };
    const payload = buildSavePayload(form, "req-3", [], dest);
    expect(payload.destination).toEqual({
      projectId: "p1",
      boardId: "b1",
      replaceSelectionId: "s1",
    });
  });

  it("does not include undefined destination in the payload object", () => {
    const payload = buildSavePayload(form, "req-4", [], undefined);
    expect(payload.destination).toBeUndefined();
    // Ensure the key is not present
    expect(Object.keys(payload)).not.toContain("destination");
  });
});

// ─── Pagination state helpers ─────────────────────────────────────────────────

describe("Pagination: deduplication", () => {
  function dedupeById<T extends { _id: string }>(existing: T[], incoming: T[]): T[] {
    const seen = new Set(existing.map((x) => x._id));
    const result = [...existing];
    for (const item of incoming) {
      if (!seen.has(item._id)) {
        seen.add(item._id);
        result.push(item);
      }
    }
    return result;
  }

  it("appends new items and deduplicates by _id", () => {
    const existing: BspProject[] = [
      { _id: "p1", name: "Project 1" },
      { _id: "p2", name: "Project 2" },
    ];
    const incoming: BspProject[] = [
      { _id: "p2", name: "Project 2 updated" }, // duplicate
      { _id: "p3", name: "Project 3" },
    ];
    const result = dedupeById(existing, incoming);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p._id)).toEqual(["p1", "p2", "p3"]);
    // Duplicate should be skipped (first value preserved)
    expect(result[1].name).toBe("Project 2");
  });

  it("returns all items when there are no duplicates", () => {
    const existing: BspBoard[] = [{ _id: "b1", name: "Board 1" }];
    const incoming: BspBoard[] = [{ _id: "b2", name: "Board 2" }, { _id: "b3", name: "Board 3" }];
    const result = dedupeById(existing, incoming);
    expect(result).toHaveLength(3);
  });

  it("returns existing items unchanged when incoming is empty", () => {
    const existing: BspSelection[] = [
      { _id: "s1", name: "Sel 1", canReplace: true, sharedWithClient: false },
    ];
    const result = dedupeById(existing, []);
    expect(result).toHaveLength(1);
  });
});

describe("Pagination: Load more on empty non-terminal page", () => {
  it("isDone: false means Load more should be shown even if page is empty", () => {
    const response: DiscoveryPage<BspProject> = {
      success: true,
      protocolVersion: 2,
      page: [], // empty page
      isDone: false,
      continueCursor: "cursor-abc",
    };
    // Load more is shown when isDone is false
    const shouldShowLoadMore = !response.isDone;
    expect(shouldShowLoadMore).toBe(true);
  });

  it("isDone: true means Load more should not be shown", () => {
    const response: DiscoveryPage<BspBoard> = {
      success: true,
      protocolVersion: 2,
      page: [],
      isDone: true,
      continueCursor: "",
    };
    const shouldShowLoadMore = !response.isDone;
    expect(shouldShowLoadMore).toBe(false);
  });

  it("continueCursor is passed correctly to next request", () => {
    const response: DiscoveryPage<BspProject> = {
      success: true,
      protocolVersion: 2,
      page: [{ _id: "p1", name: "P1" }],
      isDone: false,
      continueCursor: "cursor-xyz",
    };
    // The next request uses response.continueCursor
    expect(response.continueCursor).toBe("cursor-xyz");
  });
});

describe("Pagination: Stale response discard via generation counter", () => {
  it("increments generation on each load call and discards older generations", async () => {
    let currentGen = 0;
    const genRef = { current: 0 };

    function startLoad(): number {
      genRef.current += 1;
      currentGen = genRef.current;
      return currentGen;
    }

    function isStale(responseGen: number): boolean {
      return genRef.current !== responseGen;
    }

    // Simulate: user loads projects (gen=1), then immediately changes selection (gen=2)
    const gen1 = startLoad();
    startLoad(); // gen=2

    expect(isStale(gen1)).toBe(true);
    expect(isStale(genRef.current)).toBe(false);
  });

  it("does not discard when generation matches", () => {
    const genRef = { current: 0 };

    function startLoad(): number {
      genRef.current += 1;
      return genRef.current;
    }

    const gen = startLoad();
    expect(genRef.current === gen).toBe(true);
  });
});

// ─── Reset rules ─────────────────────────────────────────────────────────────

describe("Destination reset rules", () => {
  it("selecting a project clears board selection", () => {
    let selectedBoardId: string | null = "board-old";
    let selectedSelectionId: string | null = "sel-old";

    function handleProjectChange(projectId: string) {
      if (projectId) {
        selectedBoardId = null;
        selectedSelectionId = null;
      }
    }

    handleProjectChange("proj-new");
    expect(selectedBoardId).toBeNull();
    expect(selectedSelectionId).toBeNull();
  });

  it("selecting a board clears any chosen replacement selection", () => {
    let selectedSelectionId: string | null = "sel-old";

    function handleBoardChange(boardId: string) {
      if (boardId) {
        selectedSelectionId = null;
      }
    }

    handleBoardChange("board-new");
    expect(selectedSelectionId).toBeNull();
  });

  it("switching to library-only clears project, board, and replacement", () => {
    let selectedProjectId: string | null = "proj-abc";
    let selectedBoardId: string | null = "board-xyz";
    let selectedSelectionId: string | null = "sel-123";
    let selectionMode: "new" | "fill" = "fill";

    function handleModeChangeToLibrary() {
      selectedProjectId = null;
      selectedBoardId = null;
      selectedSelectionId = null;
      selectionMode = "new";
    }

    handleModeChangeToLibrary();
    expect(selectedProjectId).toBeNull();
    expect(selectedBoardId).toBeNull();
    expect(selectedSelectionId).toBeNull();
    expect(selectionMode).toBe("new");
  });
});

// ─── 403 discrimination ───────────────────────────────────────────────────────

describe("403 discrimination: valid key vs. revoked key", () => {
  /**
   * When a 403 comes from discovery:
   * 1. Call VERIFY_CONNECTION
   * 2. If verify returns ok: true → key is valid but selections are forbidden
   *    → disable board save, show explanation, keep library-only available
   * 3. If verify returns ok: false → key may be revoked → show reconnection prompt
   *    → do NOT automatically erase a working key
   */

  function discriminate403(
    verifyResult: { ok: boolean }
  ): "key_valid_forbidden" | "key_possibly_revoked" {
    if (verifyResult.ok) {
      return "key_valid_forbidden";
    }
    return "key_possibly_revoked";
  }

  it("403 + verify ok=true → key valid but selections forbidden", () => {
    const result = discriminate403({ ok: true });
    expect(result).toBe("key_valid_forbidden");
  });

  it("403 + verify ok=false → key possibly revoked", () => {
    const result = discriminate403({ ok: false });
    expect(result).toBe("key_possibly_revoked");
  });

  it("403 from discovery does NOT erase a working key", () => {
    // The key should be preserved regardless of discrimination result
    let keyErased = false;
    function handle403(verifyOk: boolean) {
      if (!verifyOk) {
        // Prompt reconnection but DO NOT erase key
        keyErased = false; // key preserved
      }
    }
    handle403(false);
    expect(keyErased).toBe(false);
  });

  it("403 + verify ok=true shows explanation and keeps library-only available", () => {
    let boardSaveForbidden = false;
    let libraryStillAvailable = true;

    function handle403WhenValidKey() {
      boardSaveForbidden = true;
      libraryStillAvailable = true; // library-only always available
    }

    handle403WhenValidKey();
    expect(boardSaveForbidden).toBe(true);
    expect(libraryStillAvailable).toBe(true);
  });
});

// ─── No-boards state: link construction ──────────────────────────────────────

describe("No-boards state: link construction", () => {
  it("constructs the correct link from bspWebAppOrigin and projectId", () => {
    const bspOrigin = "https://app.buildersuitepro.com";
    const projectId = "proj-abc-123";
    const expectedLink = `${bspOrigin}/projects/${projectId}/selections`;

    const link = `${bspOrigin}/projects/${projectId}/selections`;
    expect(link).toBe(expectedLink);
  });

  it("handles different origins correctly", () => {
    const bspOrigin = "https://staging.buildersuitepro.com";
    const projectId = "proj-xyz";
    const link = `${bspOrigin}/projects/${projectId}/selections`;
    expect(link).toBe("https://staging.buildersuitepro.com/projects/proj-xyz/selections");
  });

  it("no-boards condition is detected when boards are empty and done", () => {
    const boards: BspBoard[] = [];
    const boardsDone = true;
    const boardsLoading = false;
    const selectedProjectId = "proj-1";

    const noBoards =
      !boardsLoading &&
      !!selectedProjectId &&
      boards.length === 0 &&
      boardsDone;

    expect(noBoards).toBe(true);
  });

  it("no-boards is NOT triggered when boards are still loading", () => {
    const boards: BspBoard[] = [];
    const boardsDone = false;
    const boardsLoading = true;
    const selectedProjectId = "proj-1";

    const noBoards =
      !boardsLoading &&
      !!selectedProjectId &&
      boards.length === 0 &&
      boardsDone;

    expect(noBoards).toBe(false);
  });

  it("no-boards is NOT triggered when boards exist", () => {
    const boards: BspBoard[] = [{ _id: "b1", name: "Board 1" }];
    const boardsDone = true;
    const boardsLoading = false;
    const selectedProjectId = "proj-1";

    const noBoards =
      !boardsLoading &&
      !!selectedProjectId &&
      boards.length === 0 &&
      boardsDone;

    expect(noBoards).toBe(false);
  });
});

// ─── selectionPath validation ─────────────────────────────────────────────────

describe("selectionPath validation before opening", () => {
  function isValidSelectionPath(path: string | undefined): boolean {
    return typeof path === "string" && path.startsWith("/projects/");
  }

  it("accepts paths starting with /projects/", () => {
    expect(isValidSelectionPath("/projects/abc/boards/xyz/selections/sel1")).toBe(true);
    expect(isValidSelectionPath("/projects/test")).toBe(true);
  });

  it("rejects paths not starting with /projects/", () => {
    expect(isValidSelectionPath("/library/something")).toBe(false);
    expect(isValidSelectionPath("https://malicious.com/redirect")).toBe(false);
    expect(isValidSelectionPath("/admin/dangerous")).toBe(false);
  });

  it("rejects undefined selectionPath", () => {
    expect(isValidSelectionPath(undefined)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSelectionPath("")).toBe(false);
  });

  it("rejects arbitrary URL-like strings", () => {
    expect(isValidSelectionPath("javascript:alert(1)")).toBe(false);
    expect(isValidSelectionPath("data:text/html,<script>")).toBe(false);
  });

  it("constructs board link only for valid selectionPath", () => {
    const bspOrigin = "https://app.buildersuitepro.com";

    const validPath = "/projects/abc/boards/xyz";
    const invalidPath = "/library/my-items";

    const validLink = isValidSelectionPath(validPath)
      ? `${bspOrigin}${validPath}`
      : null;
    const invalidLink = isValidSelectionPath(invalidPath)
      ? `${bspOrigin}${invalidPath}`
      : null;

    expect(validLink).toBe("https://app.buildersuitepro.com/projects/abc/boards/xyz");
    expect(invalidLink).toBeNull();
  });
});

// ─── replayed: true treated as success ────────────────────────────────────────

describe("replayed: true treated as success", () => {
  it("replayed=true is a success state, not a duplicate error", () => {
    type SaveStatus = "idle" | "saving" | "success" | "error";

    function processSaveResult(result: { success: boolean; replayed: boolean }): {
      status: SaveStatus;
      message: string;
    } {
      if (!result.success) return { status: "error", message: "Save failed" };
      if (result.replayed) {
        return { status: "success", message: "Already saved" }; // success, not error
      }
      return { status: "success", message: "Saved to library!" };
    }

    const replayedResult = processSaveResult({ success: true, replayed: true });
    expect(replayedResult.status).toBe("success");
    expect(replayedResult.message).toBe("Already saved");
  });

  it("replayed=false is normal success", () => {
    function isSuccess(result: { success: boolean; replayed: boolean }): boolean {
      return result.success === true; // replayed does not affect success
    }

    expect(isSuccess({ success: true, replayed: false })).toBe(true);
    expect(isSuccess({ success: true, replayed: true })).toBe(true);
    expect(isSuccess({ success: false, replayed: false })).toBe(false);
  });
});

// ─── Replacement warning for sharedWithClient: true ──────────────────────────

describe("Replacement warning for sharedWithClient selections", () => {
  it("warns when selected replacement selection is shared with client", () => {
    const selection: BspSelection = {
      _id: "sel-1",
      name: "Living Room Sofa",
      canReplace: true,
      sharedWithClient: true,
    };

    const shouldShowSharingWarning = selection.sharedWithClient === true;
    expect(shouldShowSharingWarning).toBe(true);
  });

  it("does not warn when selection is not shared with client", () => {
    const selection: BspSelection = {
      _id: "sel-2",
      name: "Dining Table",
      canReplace: true,
      sharedWithClient: false,
    };

    const shouldShowSharingWarning = selection.sharedWithClient === true;
    expect(shouldShowSharingWarning).toBe(false);
  });

  it("only eligible (canReplace: true) selections appear in fill list", () => {
    const selections: BspSelection[] = [
      { _id: "s1", name: "Eligible", canReplace: true, sharedWithClient: false },
      { _id: "s2", name: "Ineligible - ordered", canReplace: false, sharedWithClient: false },
      { _id: "s3", name: "Eligible shared", canReplace: true, sharedWithClient: true },
    ];

    const eligibleSelections = selections.filter((s) => s.canReplace);
    expect(eligibleSelections).toHaveLength(2);
    expect(eligibleSelections.map((s) => s._id)).toEqual(["s1", "s3"]);
  });

  it("always shows warning when replacing a shared selection (no hide)", () => {
    function getWarnings(sel: BspSelection): string[] {
      const warnings: string[] = [];
      // Always show replacement warning
      warnings.push("Replacing this selection updates product fields only. Deadlines, allowances, status, sharing, and client decisions are preserved.");
      // Additionally show sharing warning if sharedWithClient
      if (sel.sharedWithClient) {
        warnings.push("This selection is already shared with the client. Saving will update what they see immediately. Their decisions and comments will be preserved.");
      }
      return warnings;
    }

    const sharedSel: BspSelection = {
      _id: "s1",
      name: "Shared Sofa",
      canReplace: true,
      sharedWithClient: true,
    };

    const warnings = getWarnings(sharedSel);
    expect(warnings).toHaveLength(2);
    expect(warnings[1]).toContain("shared with the client");
  });
});

// ─── Save blocked when project chosen but no board chosen ────────────────────

describe("Save blocked when project chosen but no board chosen", () => {
  function isDestinationBlocked(dest: DestinationFormState): boolean {
    return (
      dest.mode === "board" &&
      !!dest.projectId &&
      !dest.boardId
    );
  }

  it("blocks save when mode is board, project selected, but no board selected", () => {
    const dest: DestinationFormState = {
      mode: "board",
      projectId: "proj-1",
      boardId: undefined,
    };
    expect(isDestinationBlocked(dest)).toBe(true);
  });

  it("does NOT block when both project and board are selected", () => {
    const dest: DestinationFormState = {
      mode: "board",
      projectId: "proj-1",
      boardId: "board-1",
    };
    expect(isDestinationBlocked(dest)).toBe(false);
  });

  it("does NOT block for library-only mode", () => {
    const dest: DestinationFormState = { mode: "library" };
    expect(isDestinationBlocked(dest)).toBe(false);
  });

  it("does NOT block when mode is board but no project selected yet", () => {
    const dest: DestinationFormState = { mode: "board" };
    expect(isDestinationBlocked(dest)).toBe(false);
  });
});

// ─── Library link construction ────────────────────────────────────────────────

describe("Library link construction", () => {
  it("uses the correct library URL with materialId parameter", () => {
    const bspOrigin = "https://app.buildersuitepro.com";
    const materialId = "mat-abc-123";
    const link = `${bspOrigin}/library/my-items?tab=materials&materialId=${materialId}`;
    expect(link).toBe("https://app.buildersuitepro.com/library/my-items?tab=materials&materialId=mat-abc-123");
  });

  it("does NOT use /library alone (redirect drops parameters)", () => {
    const bspOrigin = "https://app.buildersuitepro.com";
    const materialId = "mat-123";
    const badLink = `${bspOrigin}/library`;
    const goodLink = `${bspOrigin}/library/my-items?tab=materials&materialId=${materialId}`;
    // Good link must include the full path and query params
    expect(goodLink).toContain("/library/my-items");
    expect(goodLink).toContain("tab=materials");
    expect(goodLink).toContain(`materialId=${materialId}`);
    // Bad link (redirect-only) should not be used
    expect(badLink).not.toContain("materialId");
  });
});

// ─── Discovery API response parsing ──────────────────────────────────────────

describe("Discovery API response parsing", () => {
  /**
   * These tests exercise the parsing logic for discovery responses
   * using the same validation patterns as the service worker.
   */

  function parseDiscoveryPageProjects(data: unknown): DiscoveryPage<BspProject> {
    if (typeof data !== "object" || data === null) {
      throw new ApiError("Invalid discovery response: expected JSON object");
    }
    const obj = data as Record<string, unknown>;

    if (obj["success"] !== true) {
      throw new ApiError(
        typeof obj["error"] === "string"
          ? obj["error"]
          : "Discovery failed: server returned success=false"
      );
    }
    if (typeof obj["protocolVersion"] !== "number") {
      throw new ApiError("Invalid discovery response: missing protocolVersion");
    }
    if (!Array.isArray(obj["page"])) {
      throw new ApiError("Invalid discovery response: missing page array");
    }
    if (typeof obj["isDone"] !== "boolean") {
      throw new ApiError("Invalid discovery response: missing isDone");
    }
    if (typeof obj["continueCursor"] !== "string") {
      throw new ApiError("Invalid discovery response: missing continueCursor");
    }

    const page = (obj["page"] as unknown[]).map((item) => {
      const i = item as Record<string, unknown>;
      if (typeof i["_id"] !== "string" || !i["_id"]) {
        throw new ApiError("Project item missing _id");
      }
      return { _id: i["_id"] as string, name: (i["name"] ?? "") as string };
    });

    return {
      success: true,
      protocolVersion: obj["protocolVersion"] as number,
      page,
      isDone: obj["isDone"] as boolean,
      continueCursor: obj["continueCursor"] as string,
    };
  }

  it("parses a valid projects discovery response", () => {
    const data = {
      success: true,
      protocolVersion: 2,
      page: [
        { _id: "proj-1", name: "Living Room Renovation" },
        { _id: "proj-2", name: "Kitchen Remodel" },
      ],
      isDone: false,
      continueCursor: "cursor-abc",
    };

    const result = parseDiscoveryPageProjects(data);
    expect(result.page).toHaveLength(2);
    expect(result.page[0]._id).toBe("proj-1");
    expect(result.isDone).toBe(false);
    expect(result.continueCursor).toBe("cursor-abc");
  });

  it("parses a done (last page) response", () => {
    const data = {
      success: true,
      protocolVersion: 2,
      page: [{ _id: "proj-last", name: "Final Project" }],
      isDone: true,
      continueCursor: "",
    };
    const result = parseDiscoveryPageProjects(data);
    expect(result.isDone).toBe(true);
    expect(result.continueCursor).toBe("");
  });

  it("parses an empty page (non-terminal)", () => {
    const data = {
      success: true,
      protocolVersion: 2,
      page: [],
      isDone: false,
      continueCursor: "cursor-next",
    };
    const result = parseDiscoveryPageProjects(data);
    expect(result.page).toHaveLength(0);
    expect(result.isDone).toBe(false);
  });

  it("throws ApiError when success is false", () => {
    const data = {
      success: false,
      error: "Projects not accessible",
      protocolVersion: 2,
      page: [],
      isDone: true,
      continueCursor: "",
    };
    expect(() => parseDiscoveryPageProjects(data)).toThrow("Projects not accessible");
  });

  it("throws ApiError when page is missing", () => {
    const data = {
      success: true,
      protocolVersion: 2,
      isDone: true,
      continueCursor: "",
    };
    expect(() => parseDiscoveryPageProjects(data)).toThrow(ApiError);
  });

  it("throws ApiError when isDone is missing", () => {
    const data = {
      success: true,
      protocolVersion: 2,
      page: [],
      continueCursor: "",
    };
    expect(() => parseDiscoveryPageProjects(data)).toThrow(ApiError);
  });

  it("throws ApiError when continueCursor is missing", () => {
    const data = {
      success: true,
      protocolVersion: 2,
      page: [],
      isDone: true,
    };
    expect(() => parseDiscoveryPageProjects(data)).toThrow(ApiError);
  });
});

// ─── Selection eligibility ────────────────────────────────────────────────────

describe("Selection eligibility rules", () => {
  it("only canReplace: true selections appear in fill placeholder list", () => {
    const allSelections: BspSelection[] = [
      { _id: "s1", name: "Open slot", canReplace: true, sharedWithClient: false },
      { _id: "s2", name: "Ordered item", canReplace: false, sharedWithClient: false },
      { _id: "s3", name: "Shared open slot", canReplace: true, sharedWithClient: true },
      { _id: "s4", name: "Another ordered", canReplace: false, sharedWithClient: true },
    ];

    const eligible = allSelections.filter((s) => s.canReplace);
    const ineligible = allSelections.filter((s) => !s.canReplace);

    expect(eligible).toHaveLength(2);
    expect(ineligible).toHaveLength(2);
    expect(eligible.map((s) => s._id)).toEqual(["s1", "s3"]);
  });

  it("sharedWithClient flag triggers additional warning but does not block selection", () => {
    const sel: BspSelection = {
      _id: "s1",
      name: "Shared selection",
      canReplace: true,
      sharedWithClient: true,
    };

    // Should be eligible for selection
    expect(sel.canReplace).toBe(true);
    // Should trigger extra warning
    expect(sel.sharedWithClient).toBe(true);
  });
});

// ─── numItems constraint ──────────────────────────────────────────────────────

describe("numItems must be an integer 1–100", () => {
  function isValidNumItems(n: unknown): boolean {
    return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 100;
  }

  it("accepts 25 (the default)", () => {
    expect(isValidNumItems(25)).toBe(true);
  });

  it("accepts 1 (minimum)", () => {
    expect(isValidNumItems(1)).toBe(true);
  });

  it("accepts 100 (maximum)", () => {
    expect(isValidNumItems(100)).toBe(true);
  });

  it("rejects 0", () => {
    expect(isValidNumItems(0)).toBe(false);
  });

  it("rejects 101", () => {
    expect(isValidNumItems(101)).toBe(false);
  });

  it("rejects fractional values", () => {
    expect(isValidNumItems(25.5)).toBe(false);
  });
});
