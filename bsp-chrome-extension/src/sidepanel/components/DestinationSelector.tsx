/**
 * DestinationSelector – Project → Board → Selection destination flow.
 *
 * All discovery calls POST to the v2 product URL via the service worker
 * (credentials never reach this file or the DOM).
 *
 * Pagination rules enforced:
 * - "Load more" button shown until isDone: true, including empty nonterminal pages
 * - Items deduplicated by _id when appending pages
 * - Stale responses discarded via generation counters
 * - Re-fetch on project/board change; clear downstream on upstream change
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import type {
  BspProject,
  BspBoard,
  BspSelection,
  DiscoveryPage,
  MessageResponse,
} from "../../types/index.js";
import type { DestinationFormState } from "../../shared/validation.js";

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  section: {
    marginBottom: 10,
  },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "#666",
    marginBottom: 4,
  },
  select: {
    width: "100%",
    boxSizing: "border-box" as const,
    fontSize: 12,
    padding: "5px 8px",
    border: "1px solid #e0e0e0",
    borderRadius: 5,
    background: "#fff",
    color: "#2D2D2D",
    cursor: "pointer",
  },
  selectDisabled: {
    background: "#f5f5f5",
    color: "#aaa",
    cursor: "not-allowed",
  },
  radioRow: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 13,
    color: "#444",
    cursor: "pointer",
    marginBottom: 6,
    userSelect: "none" as const,
  },
  radio: {
    accentColor: "#B8962E",
    cursor: "pointer",
  },
  loadMoreBtn: {
    fontSize: 11,
    padding: "3px 10px",
    background: "#f0f0f0",
    border: "1px solid #ccc",
    borderRadius: 4,
    cursor: "pointer",
    marginTop: 5,
  },
  refreshBtn: {
    fontSize: 10,
    padding: "2px 7px",
    background: "none",
    border: "1px solid #ccc",
    borderRadius: 4,
    cursor: "pointer",
    marginLeft: 6,
    color: "#666",
  },
  loadingText: {
    fontSize: 11,
    color: "#888",
    marginTop: 4,
  },
  errorBox: {
    background: "#fdecea",
    border: "1px solid #f5c6cb",
    borderRadius: 5,
    padding: "6px 9px",
    fontSize: 11,
    color: "#721c24",
    marginTop: 5,
  },
  warningBox: {
    background: "#fff8e1",
    border: "1px solid #f0c040",
    borderRadius: 5,
    padding: "7px 10px",
    fontSize: 11,
    color: "#856404",
    marginTop: 6,
    lineHeight: 1.5,
  },
  infoBox: {
    background: "#f0f8ff",
    border: "1px solid #b3d9f7",
    borderRadius: 5,
    padding: "7px 10px",
    fontSize: 11,
    color: "#1a5c8a",
    marginTop: 5,
    lineHeight: 1.5,
  },
  blockingMsg: {
    fontSize: 11,
    color: "#856404",
    background: "#fff8e1",
    border: "1px solid #f0c040",
    borderRadius: 4,
    padding: "5px 9px",
    marginTop: 6,
  },
  selectionItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 0",
    fontSize: 12,
    borderBottom: "1px solid #f5f5f5",
  },
  selectionName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  selectionRadio: {
    accentColor: "#B8962E",
    cursor: "pointer",
    flexShrink: 0,
  },
  disabledSelectionName: {
    color: "#bbb",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

interface DestinationSelectorProps {
  bspOrigin: string;
  onChange: (state: DestinationFormState) => void;
}

export default function DestinationSelector({ bspOrigin, onChange }: DestinationSelectorProps) {
  // ── Destination mode ────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"library" | "board">("library");

  // ── Projects ────────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<BspProject[]>([]);
  const [projectsDone, setProjectsDone] = useState(false);
  const [projectsCursor, setProjectsCursor] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectsGen, setProjectsGen] = useState(0);

  // ── Boards ──────────────────────────────────────────────────────────────────
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [boards, setBoards] = useState<BspBoard[]>([]);
  const [boardsDone, setBoardsDone] = useState(false);
  const [boardsCursor, setBoardsCursor] = useState<string | null>(null);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [boardsError, setBoardsError] = useState<string | null>(null);
  const [boardsGen, setBoardsGen] = useState(0);

  // ── Selections ──────────────────────────────────────────────────────────────
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selections, setSelections] = useState<BspSelection[]>([]);
  const [selectionsDone, setSelectionsDone] = useState(false);
  const [selectionsCursor, setSelectionsCursor] = useState<string | null>(null);
  const [selectionsLoading, setSelectionsLoading] = useState(false);
  const [selectionsError, setSelectionsError] = useState<string | null>(null);
  const [selectionsGen, setSelectionsGen] = useState(0);

  // ── Selection mode ──────────────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState<"new" | "fill">("new");
  const [selectedSelectionId, setSelectedSelectionId] = useState<string | null>(null);

  // ── 403 / permissions state ─────────────────────────────────────────────────
  const [boardSaveForbidden, setBoardSaveForbidden] = useState(false);
  const [forbiddenMessage, setForbiddenMessage] = useState<string | null>(null);

  const projectsGenRef = useRef(0);
  const boardsGenRef = useRef(0);
  const selectionsGenRef = useRef(0);

  // ── Notify parent on change ─────────────────────────────────────────────────

  useEffect(() => {
    onChange({
      mode,
      projectId: selectedProjectId ?? undefined,
      boardId: selectedBoardId ?? undefined,
      selectionMode,
      replaceSelectionId: selectionMode === "fill" && selectedSelectionId
        ? selectedSelectionId
        : undefined,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedProjectId, selectedBoardId, selectionMode, selectedSelectionId]);

  // ── Discovery helpers ───────────────────────────────────────────────────────

  async function handle403(errorMsg: string) {
    // Check if the key is valid but selections permission is missing
    const verifyResp = await new Promise<MessageResponse>((resolve) => {
      chrome.runtime.sendMessage({ type: "VERIFY_CONNECTION" }, (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message ?? "Verify failed" });
        } else {
          resolve(resp as MessageResponse);
        }
      });
    });

    if (verifyResp.ok) {
      // Key is valid, but board/selections permissions denied
      setBoardSaveForbidden(true);
      setForbiddenMessage(
        "Your connection does not have access to project selections. Saving to Library only."
      );
    } else {
      // Key may be revoked — prompt reconnection but don't erase it
      setBoardSaveForbidden(false);
      setProjectsError(
        `${errorMsg} — Connection may be revoked. Please verify your connection in Settings.`
      );
    }
  }

  const loadProjects = useCallback(
    async (cursor: string | null, reset = false) => {
      const gen = projectsGenRef.current + 1;
      projectsGenRef.current = gen;
      setProjectsGen(gen);

      if (reset) {
        setProjects([]);
        setProjectsDone(false);
        setProjectsCursor(null);
      }

      setProjectsLoading(true);
      setProjectsError(null);
      setBoardSaveForbidden(false);
      setForbiddenMessage(null);

      const resp = await new Promise<MessageResponse<DiscoveryPage<BspProject>>>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "DISCOVER_PROJECTS", cursor },
          (r) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message ?? "Discovery failed" });
            } else {
              resolve(r as MessageResponse<DiscoveryPage<BspProject>>);
            }
          }
        );
      });

      // Discard if a newer generation was started
      if (projectsGenRef.current !== gen) return;
      setProjectsLoading(false);

      if (!resp.ok) {
        const errMsg = resp.error ?? "Failed to load projects";
        if (errMsg.includes("403") || errMsg.includes("Forbidden") || errMsg.includes("forbidden")) {
          await handle403(errMsg);
        } else {
          setProjectsError(errMsg);
        }
        return;
      }

      const data = resp.data;
      setProjects((prev) => reset ? data.page : dedupeById(prev, data.page));
      setProjectsDone(data.isDone);
      setProjectsCursor(data.continueCursor);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const loadBoards = useCallback(
    async (projectId: string, cursor: string | null, reset = false) => {
      const gen = boardsGenRef.current + 1;
      boardsGenRef.current = gen;
      setBoardsGen(gen);

      if (reset) {
        setBoards([]);
        setBoardsDone(false);
        setBoardsCursor(null);
      }

      setBoardsLoading(true);
      setBoardsError(null);

      const resp = await new Promise<MessageResponse<DiscoveryPage<BspBoard>>>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "DISCOVER_BOARDS", projectId, cursor },
          (r) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message ?? "Discovery failed" });
            } else {
              resolve(r as MessageResponse<DiscoveryPage<BspBoard>>);
            }
          }
        );
      });

      // Discard stale response
      if (boardsGenRef.current !== gen) return;
      setBoardsLoading(false);

      if (!resp.ok) {
        setBoardsError(resp.error ?? "Failed to load boards");
        return;
      }

      const data = resp.data;
      setBoards((prev) => reset ? data.page : dedupeById(prev, data.page));
      setBoardsDone(data.isDone);
      setBoardsCursor(data.continueCursor);
    },
    []
  );

  const loadSelections = useCallback(
    async (projectId: string, boardId: string, cursor: string | null, reset = false) => {
      const gen = selectionsGenRef.current + 1;
      selectionsGenRef.current = gen;
      setSelectionsGen(gen);

      if (reset) {
        setSelections([]);
        setSelectionsDone(false);
        setSelectionsCursor(null);
      }

      setSelectionsLoading(true);
      setSelectionsError(null);

      const resp = await new Promise<MessageResponse<DiscoveryPage<BspSelection>>>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "DISCOVER_SELECTIONS", projectId, boardId, cursor },
          (r) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message ?? "Discovery failed" });
            } else {
              resolve(r as MessageResponse<DiscoveryPage<BspSelection>>);
            }
          }
        );
      });

      // Discard stale response
      if (selectionsGenRef.current !== gen) return;
      setSelectionsLoading(false);

      if (!resp.ok) {
        setSelectionsError(resp.error ?? "Failed to load selections");
        return;
      }

      const data = resp.data;
      setSelections((prev) => reset ? data.page : dedupeById(prev, data.page));
      setSelectionsDone(data.isDone);
      setSelectionsCursor(data.continueCursor);
    },
    []
  );

  // ── Mode change ─────────────────────────────────────────────────────────────

  function handleModeChange(newMode: "library" | "board") {
    setMode(newMode);
    if (newMode === "library") {
      // Clear everything when switching to library-only
      setSelectedProjectId(null);
      setSelectedBoardId(null);
      setBoards([]);
      setBoardsDone(false);
      setBoardsCursor(null);
      setBoardsError(null);
      setSelections([]);
      setSelectionsDone(false);
      setSelectionsCursor(null);
      setSelectionsError(null);
      setSelectionMode("new");
      setSelectedSelectionId(null);
      setBoardSaveForbidden(false);
      setForbiddenMessage(null);
    } else if (newMode === "board" && projects.length === 0 && !projectsDone) {
      // Load projects on first open
      loadProjects(null, true);
    }
  }

  // ── Project selection ───────────────────────────────────────────────────────

  function handleProjectChange(projectId: string) {
    if (projectId === selectedProjectId) return;
    setSelectedProjectId(projectId || null);
    // Reset downstream
    setSelectedBoardId(null);
    setBoards([]);
    setBoardsDone(false);
    setBoardsCursor(null);
    setBoardsError(null);
    setSelections([]);
    setSelectionsDone(false);
    setSelectionsCursor(null);
    setSelectionsError(null);
    setSelectionMode("new");
    setSelectedSelectionId(null);

    if (projectId) {
      loadBoards(projectId, null, true);
    }
  }

  // ── Board selection ─────────────────────────────────────────────────────────

  function handleBoardChange(boardId: string) {
    if (boardId === selectedBoardId) return;
    setSelectedBoardId(boardId || null);
    // Reset downstream
    setSelections([]);
    setSelectionsDone(false);
    setSelectionsCursor(null);
    setSelectionsError(null);
    setSelectionMode("new");
    setSelectedSelectionId(null);

    if (boardId && selectedProjectId) {
      loadSelections(selectedProjectId, boardId, null, true);
    }
  }

  // ── Selection change ────────────────────────────────────────────────────────

  function handleSelectionModeChange(m: "new" | "fill") {
    setSelectionMode(m);
    if (m === "new") setSelectedSelectionId(null);
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const eligibleSelections = selections.filter((s) => s.canReplace);
  const ineligibleSelections = selections.filter((s) => !s.canReplace);
  const hasEligibleSelections = eligibleSelections.length > 0;
  const noBoards = !boardsLoading && !boardsError && selectedProjectId && boards.length === 0 && boardsDone;
  const projectBoards = selectedProjectId ? boards : [];
  const selectedProject = projects.find((p) => p._id === selectedProjectId);
  const selectedSelection = eligibleSelections.find((s) => s._id === selectedSelectionId);
  const selectionIsShared = selectedSelection?.sharedWithClient === true;

  // ── Render ──────────────────────────────────────────────────────────────────

  // Suppress board UI when forbidden
  if (boardSaveForbidden && forbiddenMessage) {
    return (
      <div>
        <div style={s.radioRow}>
          <input
            type="radio"
            checked={mode === "library"}
            onChange={() => {
              setMode("library");
              setBoardSaveForbidden(false);
              setForbiddenMessage(null);
            }}
            style={s.radio}
            id="dest-library-forbidden"
          />
          <label htmlFor="dest-library-forbidden">Library only</label>
        </div>
        <div style={s.infoBox}>{forbiddenMessage}</div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Mode selection ── */}
      <div style={s.radioRow}>
        <input
          type="radio"
          id="dest-library"
          checked={mode === "library"}
          onChange={() => handleModeChange("library")}
          style={s.radio}
        />
        <label htmlFor="dest-library" style={{ cursor: "pointer" }}>Library only</label>
      </div>
      <div style={s.radioRow}>
        <input
          type="radio"
          id="dest-board"
          checked={mode === "board"}
          onChange={() => handleModeChange("board")}
          style={s.radio}
        />
        <label htmlFor="dest-board" style={{ cursor: "pointer" }}>Add to board</label>
      </div>

      {mode === "board" && (
        <div style={{ marginTop: 6 }}>

          {/* ── Projects ── */}
          <div style={s.section}>
            <div style={s.headerRow}>
              <label style={s.label}>Project</label>
              <button
                style={s.refreshBtn}
                type="button"
                onClick={() => loadProjects(null, true)}
                disabled={projectsLoading}
                title="Refresh projects"
              >
                ↻ Refresh
              </button>
            </div>
            <select
              style={s.select}
              value={selectedProjectId ?? ""}
              onChange={(e) => handleProjectChange(e.target.value)}
              disabled={projectsLoading && projects.length === 0}
            >
              <option value="">
                {projectsLoading && projects.length === 0 ? "Loading…" : "— Select project —"}
              </option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
            {projectsError && <div style={s.errorBox}>{projectsError}</div>}
            {!projectsDone && (
              <button
                style={s.loadMoreBtn}
                type="button"
                onClick={() => loadProjects(projectsCursor, false)}
                disabled={projectsLoading}
              >
                {projectsLoading ? "Loading…" : "Load more projects"}
              </button>
            )}
          </div>

          {/* ── Boards ── */}
          {selectedProjectId && (
            <div style={s.section}>
              <div style={s.headerRow}>
                <label style={s.label}>Board</label>
                <button
                  style={s.refreshBtn}
                  type="button"
                  onClick={() => {
                    if (selectedProjectId) loadBoards(selectedProjectId, null, true);
                  }}
                  disabled={boardsLoading}
                  title="Refresh boards"
                >
                  ↻ Refresh
                </button>
              </div>

              {noBoards ? (
                <div style={s.warningBox}>
                  This project has no selection boards. Create one in the project's Selections first.
                  {bspOrigin && selectedProjectId && (
                    <>
                      {" "}
                      <a
                        href={`${bspOrigin}/projects/${selectedProjectId}/selections`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#856404" }}
                      >
                        Open Selections
                      </a>
                    </>
                  )}
                  <div style={{ marginTop: 5 }}>
                    <button
                      style={s.refreshBtn}
                      type="button"
                      onClick={() => {
                        if (selectedProjectId) loadBoards(selectedProjectId, null, true);
                      }}
                      disabled={boardsLoading}
                    >
                      {boardsLoading ? "Loading…" : "Refresh boards"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <select
                    style={{
                      ...s.select,
                      ...(boardsLoading && projectBoards.length === 0 ? s.selectDisabled : {}),
                    }}
                    value={selectedBoardId ?? ""}
                    onChange={(e) => handleBoardChange(e.target.value)}
                    disabled={boardsLoading && projectBoards.length === 0}
                  >
                    <option value="">
                      {boardsLoading && projectBoards.length === 0 ? "Loading…" : "— Select board —"}
                    </option>
                    {projectBoards.map((b) => (
                      <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                  </select>
                  {boardsError && <div style={s.errorBox}>{boardsError}</div>}
                  {!boardsDone && selectedProjectId && (
                    <button
                      style={s.loadMoreBtn}
                      type="button"
                      onClick={() => {
                        if (selectedProjectId) loadBoards(selectedProjectId, boardsCursor, false);
                      }}
                      disabled={boardsLoading}
                    >
                      {boardsLoading ? "Loading…" : "Load more boards"}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Selection ── */}
          {selectedBoardId && selectedProjectId && !noBoards && (
            <div style={s.section}>
              <div style={s.headerRow}>
                <label style={s.label}>Selection</label>
                <button
                  style={s.refreshBtn}
                  type="button"
                  onClick={() => {
                    if (selectedProjectId && selectedBoardId)
                      loadSelections(selectedProjectId, selectedBoardId, null, true);
                  }}
                  disabled={selectionsLoading}
                  title="Refresh selections"
                >
                  ↻ Refresh
                </button>
              </div>

              {/* New selection (default) */}
              <div style={s.radioRow}>
                <input
                  type="radio"
                  id="sel-new"
                  checked={selectionMode === "new"}
                  onChange={() => handleSelectionModeChange("new")}
                  style={s.selectionRadio}
                />
                <label htmlFor="sel-new" style={{ cursor: "pointer", fontSize: 12 }}>
                  New selection (private, pending)
                </label>
              </div>

              {/* Fill placeholder (only if eligible selections exist or loading) */}
              {(hasEligibleSelections || selectionsLoading || !selectionsDone) && (
                <div style={{ ...s.radioRow, alignItems: "flex-start" }}>
                  <input
                    type="radio"
                    id="sel-fill"
                    checked={selectionMode === "fill"}
                    onChange={() => handleSelectionModeChange("fill")}
                    style={{ ...s.selectionRadio, marginTop: 2 }}
                    disabled={!hasEligibleSelections && !selectionsLoading}
                  />
                  <div style={{ flex: 1 }}>
                    <label
                      htmlFor="sel-fill"
                      style={{ cursor: "pointer", fontSize: 12, color: !hasEligibleSelections ? "#aaa" : "#444" }}
                    >
                      Fill placeholder
                    </label>

                    {selectionMode === "fill" && (
                      <div style={{ marginTop: 5 }}>
                        {selectionsLoading && selections.length === 0 && (
                          <div style={s.loadingText}>Loading selections…</div>
                        )}
                        {selectionsError && (
                          <div style={s.errorBox}>{selectionsError}</div>
                        )}

                        {/* Eligible selections */}
                        {eligibleSelections.map((sel) => (
                          <div key={sel._id} style={s.selectionItem}>
                            <input
                              type="radio"
                              name="fill-selection"
                              value={sel._id}
                              checked={selectedSelectionId === sel._id}
                              onChange={() => setSelectedSelectionId(sel._id)}
                              style={s.selectionRadio}
                              id={`fill-sel-${sel._id}`}
                            />
                            <label
                              htmlFor={`fill-sel-${sel._id}`}
                              style={{ ...s.selectionName, cursor: "pointer" }}
                              title={sel.name}
                            >
                              {sel.name}
                              {sel.sharedWithClient && (
                                <span
                                  style={{
                                    marginLeft: 5,
                                    fontSize: 9,
                                    background: "#fff3cd",
                                    color: "#856404",
                                    padding: "1px 4px",
                                    borderRadius: 3,
                                    fontWeight: 600,
                                    verticalAlign: "middle",
                                  }}
                                >
                                  Shared
                                </span>
                              )}
                            </label>
                          </div>
                        ))}

                        {/* Ineligible selections (disabled) */}
                        {ineligibleSelections.map((sel) => (
                          <div key={sel._id} style={{ ...s.selectionItem, opacity: 0.5 }}>
                            <input
                              type="radio"
                              disabled
                              style={{ ...s.selectionRadio, cursor: "not-allowed" }}
                            />
                            <span
                              style={{ ...s.selectionName, ...s.disabledSelectionName }}
                              title={`${sel.name} — cannot be replaced`}
                            >
                              {sel.name}
                            </span>
                          </div>
                        ))}

                        {/* Load more */}
                        {!selectionsDone && (
                          <button
                            style={s.loadMoreBtn}
                            type="button"
                            onClick={() => {
                              if (selectedProjectId && selectedBoardId)
                                loadSelections(selectedProjectId, selectedBoardId, selectionsCursor, false);
                            }}
                            disabled={selectionsLoading}
                          >
                            {selectionsLoading ? "Loading…" : "Load more"}
                          </button>
                        )}

                        {selectionsDone && !hasEligibleSelections && !selectionsLoading && (
                          <div style={s.loadingText}>
                            No eligible placeholders found on this board.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Already selected: show warning for shared selection */}
              {selectionMode === "fill" && selectedSelectionId && selectionIsShared && (
                <div style={s.warningBox}>
                  This selection is already shared with the client. Saving will update what they
                  see immediately. Their decisions and comments will be preserved.
                </div>
              )}

              {/* Replacement warning (always show when fill mode and item selected) */}
              {selectionMode === "fill" && selectedSelectionId && (
                <div style={{ ...s.warningBox, marginTop: 4 }}>
                  Replacing this selection updates product fields only. Deadlines, allowances,
                  status, sharing, and client decisions are preserved.
                </div>
              )}
            </div>
          )}

          {/* ── New selection info ── */}
          {selectionMode === "new" && selectedBoardId && (
            <div style={s.infoBox}>
              New selection: private, pending. Not visible to client until you share it from
              the board. Cover image comes from the first uploaded image (or imageUrls[0]).
              Selling price (cost + markup) appears on the board; cost and internal notes stay
              in the library.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Re-export so ProductForm doesn't need to import from validation directly
export type { DestinationFormState };
