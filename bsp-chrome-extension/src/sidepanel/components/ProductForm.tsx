import React, { useState, useEffect, useCallback, useRef } from "react";
import type {
  ProductFormState,
  ExtractionResult,
  PriceCandidate,
  ProductSavePayload,
  SaveApiResponse,
  DraftRecord,
  MessageResponse,
} from "../../types/index.js";
import {
  validateProductForm,
  buildSavePayload,
} from "../../shared/validation.js";
import ImageGallery from "./ImageGallery.js";
import PricingPreview from "./PricingPreview.js";

// ─── Default form state ───────────────────────────────────────────────────────

function defaultForm(sourceUrl = ""): ProductFormState {
  return {
    title: "",
    sourceUrl,
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
    category: "Other",
    vendorDescription: "",
    internalNotes: "",
    tags: "",
    imageUrls: [],
    selectedImageIndexes: [],
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", gap: 0 },
  section: {
    borderBottom: "1px solid #eee",
    paddingBottom: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  fieldGroup: { marginBottom: 10 },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "#444",
    marginBottom: 4,
  },
  labelHint: {
    fontWeight: 400,
    color: "#999",
    fontSize: 11,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    fontSize: 13,
    padding: "5px 8px",
    border: "1px solid #ccc",
    borderRadius: 4,
    outline: "none",
    background: "#fff",
  },
  inputError: {
    borderColor: "#c0392b",
  },
  inputReadOnly: {
    background: "#f8f8f8",
    color: "#666",
    cursor: "default",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    fontSize: 12,
    padding: "5px 8px",
    border: "1px solid #ccc",
    borderRadius: 4,
    outline: "none",
    resize: "vertical",
    background: "#fff",
    fontFamily: "inherit",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  row3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
  },
  errorText: {
    fontSize: 11,
    color: "#c0392b",
    marginTop: 3,
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    cursor: "pointer",
    userSelect: "none",
  },
  checkbox: { accentColor: "#B8962E", cursor: "pointer" },
  warning: {
    background: "#fff8e1",
    border: "1px solid #f0c040",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 12,
    color: "#856404",
    marginBottom: 10,
  },
  priceCandidateList: {
    marginTop: 6,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  priceCandidateItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
  },
  collapsibleBtn: {
    width: "100%",
    textAlign: "left",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    color: "#666",
    padding: "4px 0",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  sourceUrlEditBtn: {
    fontSize: 11,
    color: "#B8962E",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    marginLeft: 6,
    textDecoration: "underline",
  },
  extractBtn: {
    width: "100%",
    padding: "8px 0",
    background: "#2D2D2D",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: 12,
  },
  saveBtn: {
    width: "100%",
    padding: "10px 0",
    background: "#B8962E",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 4,
  },
  saveBtnDisabled: {
    background: "#ccc",
    cursor: "not-allowed",
  },
  successBox: {
    background: "#eafaf1",
    border: "1px solid #2ecc71",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 12,
    color: "#1a7a45",
    marginTop: 8,
  },
  draftBanner: {
    background: "#fff9e6",
    border: "1px solid #f0c040",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 11,
    color: "#555",
    marginBottom: 8,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  unknownOutcome: {
    background: "#fff3cd",
    border: "1px solid #ffc107",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 12,
    color: "#664d03",
    marginTop: 8,
  },
  placeholder: {
    background: "#f5f5f5",
    border: "1px dashed #ccc",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    marginBottom: 10,
  },
  pickRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  pickBtn: {
    fontSize: 11,
    padding: "3px 8px",
    background: "#f0f0f0",
    border: "1px solid #ccc",
    borderRadius: 4,
    cursor: "pointer",
  },
  autofillDot: {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#B8962E",
    marginLeft: 4,
    verticalAlign: "middle",
    title: "Auto-filled from page",
  },
};

// ─── Field component ──────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  autoFilled?: boolean;
}

function Field({ label, hint, error, children, autoFilled }: FieldProps) {
  return (
    <div style={s.fieldGroup}>
      <label style={s.label}>
        {label}
        {hint && <span style={s.labelHint}> {hint}</span>}
        {autoFilled && (
          <span
            style={s.autofillDot}
            title="Auto-filled from page"
          />
        )}
      </label>
      {children}
      {error && <div style={s.errorText}>{error}</div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ProductFormProps {
  activeTabId: number | null;
  activeTabUrl: string;
  bspOrigin: string;
  isConnected: boolean;
}

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success"; materialId: string; path: string; replayed: boolean }
  | { status: "unknown"; requestId: string; frozenPayload: ProductSavePayload; error: string }
  | { status: "error"; error: string; keepDraft: boolean };

type AutoFilledFields = Set<keyof ProductFormState>;

export default function ProductForm({
  activeTabId,
  activeTabUrl,
  bspOrigin,
  isConnected,
}: ProductFormProps) {
  const [form, setForm] = useState<ProductFormState>(() =>
    defaultForm(activeTabUrl)
  );
  const [autoFilled, setAutoFilled] = useState<AutoFilledFields>(new Set());
  const [errors, setErrors] = useState<ReturnType<typeof validateProductForm>>(
    {}
  );
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [priceCandidates, setPriceCandidates] = useState<PriceCandidate[]>([]);
  const [currencyWarning, setCurrencyWarning] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [editingSourceUrl, setEditingSourceUrl] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftBanner, setDraftBanner] = useState<string | null>(null);

  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load draft on mount ─────────────────────────────────────────────────────

  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "LOAD_DRAFT" },
      (response: MessageResponse<{ draft: DraftRecord | null; pending: unknown }>) => {
        if (chrome.runtime.lastError || !response.ok) return;
        const { draft } = response.data;
        if (!draft) {
          setDraftLoaded(true);
          return;
        }

        if (draft.sourceUrl === activeTabUrl || !activeTabUrl) {
          // Same page – restore silently
          setForm(draft.form);
          setDraftBanner(
            `Draft restored from ${new Date(draft.savedAt).toLocaleTimeString()}`
          );
        } else {
          // Different page – prompt
          const replace = window.confirm(
            `A draft exists for a different page:\n${draft.sourceUrl}\n\nReplace it with a new draft for the current page?`
          );
          if (!replace) {
            setForm(draft.form);
            setDraftBanner(`Using draft from ${draft.sourceUrl}`);
          }
          // If replace, start fresh (default form already set)
        }
        setDraftLoaded(true);
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save draft on form change ─────────────────────────────────────────

  const saveDraftDebounced = useCallback(
    (f: ProductFormState) => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        const draft: DraftRecord = {
          sourceUrl: f.sourceUrl || activeTabUrl,
          form: f,
          savedAt: Date.now(),
        };
        chrome.runtime.sendMessage({ type: "SAVE_DRAFT", draft });
      }, 800);
    },
    [activeTabUrl]
  );

  useEffect(() => {
    if (!draftLoaded) return;
    saveDraftDebounced(form);
  }, [form, draftLoaded, saveDraftDebounced]);

  // ── Validation on change ────────────────────────────────────────────────────

  useEffect(() => {
    setErrors(validateProductForm(form));
  }, [form]);

  // ── Form helpers ────────────────────────────────────────────────────────────

  function updateField<K extends keyof ProductFormState>(
    key: K,
    value: ProductFormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function inputProps(key: keyof ProductFormState, extra?: React.InputHTMLAttributes<HTMLInputElement>) {
    return {
      style: {
        ...s.input,
        ...(errors[key as keyof typeof errors] ? s.inputError : {}),
      },
      value: form[key] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        updateField(key, e.target.value as ProductFormState[typeof key]),
      ...extra,
    };
  }

  function textareaProps(key: keyof ProductFormState) {
    return {
      style: {
        ...s.textarea,
        ...(errors[key as keyof typeof errors] ? s.inputError : {}),
      } as React.CSSProperties,
      value: form[key] as string,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
        updateField(key, e.target.value as ProductFormState[typeof key]),
    };
  }

  // ── Pick interactions ───────────────────────────────────────────────────────

  async function pickText(field: keyof ProductFormState) {
    if (!activeTabId) return;
    const response = await new Promise<MessageResponse>((resolve) => {
      chrome.tabs.sendMessage(activeTabId, { type: "START_PICK_TEXT" }, resolve);
    });
    if (response?.ok && (response as { ok: true; data: string | null }).data) {
      updateField(
        field,
        (response as { ok: true; data: string }).data as ProductFormState[typeof field]
      );
    }
  }

  async function pickImage() {
    if (!activeTabId) return;
    const response = await new Promise<MessageResponse>((resolve) => {
      chrome.tabs.sendMessage(activeTabId, { type: "START_PICK_IMAGE" }, resolve);
    });
    if (response?.ok && (response as { ok: true; data: string | null }).data) {
      const url = (response as { ok: true; data: string }).data;
      addImageUrl(url);
    }
  }

  // ── Extraction ──────────────────────────────────────────────────────────────

  async function handleExtract() {
    if (!activeTabId) {
      setExtractError("No active tab to extract from");
      return;
    }
    setExtracting(true);
    setExtractError(null);
    setPriceCandidates([]);
    setCurrencyWarning(null);

    try {
      // Send directly to content script on the active tab
      const response = await new Promise<MessageResponse<ExtractionResult>>(
        (resolve) => {
          chrome.tabs.sendMessage(
            activeTabId,
            { type: "EXTRACT_PRODUCT" },
            (resp) => {
              if (chrome.runtime.lastError) {
                resolve({
                  ok: false,
                  error: chrome.runtime.lastError.message ?? "Content script not ready",
                });
              } else {
                resolve(resp as MessageResponse<ExtractionResult>);
              }
            }
          );
        }
      );

      if (!response.ok) {
        // Check if it's a protected page
        const errMsg = response.error ?? "Extraction failed";
        if (
          errMsg.includes("Cannot access") ||
          errMsg.includes("chrome://") ||
          errMsg.includes("chrome-extension://") ||
          errMsg.includes("protected")
        ) {
          setExtractError(
            "This page cannot be inspected (protected browser page). Please enter product details manually."
          );
        } else {
          setExtractError(errMsg);
        }
        return;
      }

      const result = response.data;
      const newAutoFilled: AutoFilledFields = new Set();

      function applyField<K extends keyof ProductFormState>(
        key: K,
        value: ProductFormState[K] | undefined
      ) {
        if (value !== undefined && value !== null) {
          updateField(key, value);
          newAutoFilled.add(key);
        }
      }

      applyField("title", result.title as string | undefined);
      applyField("sourceUrl", result.sourceUrl as string);
      applyField("description", result.description as string | undefined);
      applyField("supplierName", result.supplierName as string | undefined);
      applyField("manufacturer", result.manufacturer as string | undefined);
      applyField("sku", result.sku as string | undefined);
      applyField("dimensions", result.dimensions as string | undefined);
      applyField("finishColor", result.finishColor as string | undefined);
      applyField("composition", result.composition as string | undefined);
      applyField("category", result.category as string | undefined);

      if (result.imageUrls && result.imageUrls.length > 0) {
        const combined = [
          ...form.imageUrls,
          ...result.imageUrls.filter((u) => !form.imageUrls.includes(u)),
        ].slice(0, 10);
        const selectedIndexes = combined.map(() => true);
        setForm((prev) => ({
          ...prev,
          imageUrls: combined,
          selectedImageIndexes: selectedIndexes,
        }));
        newAutoFilled.add("imageUrls");
      }

      if (result.cost !== undefined && !result.currencyWarning) {
        applyField("cost", String(result.cost) as ProductFormState["cost"]);
      }

      if (result.currencyWarning) {
        setCurrencyWarning(result.currencyWarning);
      }

      if (result.priceCandidates && result.priceCandidates.length > 1) {
        setPriceCandidates(result.priceCandidates);
      }

      setAutoFilled(newAutoFilled);
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : "Extraction failed"
      );
    } finally {
      setExtracting(false);
    }
  }

  // ── Image management ────────────────────────────────────────────────────────

  function addImageUrl(url: string) {
    setForm((prev) => {
      if (prev.imageUrls.includes(url)) return prev;
      const newUrls = [...prev.imageUrls, url].slice(0, 10);
      const newSelected = [
        ...prev.selectedImageIndexes,
        prev.selectedImageIndexes.length < 5, // auto-check if under limit
      ];
      return { ...prev, imageUrls: newUrls, selectedImageIndexes: newSelected };
    });
  }

  function removeImage(index: number) {
    setForm((prev) => {
      const newUrls = prev.imageUrls.filter((_, i) => i !== index);
      const newSelected = prev.selectedImageIndexes.filter(
        (_, i) => i !== index
      );
      return { ...prev, imageUrls: newUrls, selectedImageIndexes: newSelected };
    });
  }

  function toggleImage(index: number) {
    setForm((prev) => {
      const newSelected = [...prev.selectedImageIndexes];
      newSelected[index] = !newSelected[index];
      return { ...prev, selectedImageIndexes: newSelected };
    });
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  const hasErrors = Object.keys(errors).length > 0;

  async function handleSave() {
    if (hasErrors || saveState.status === "saving") return;
    const requestId = crypto.randomUUID();
    const payload = buildSavePayload(form, requestId);
    await doSave(payload);
  }

  async function handleRetry(frozenPayload: ProductSavePayload) {
    await doSave(frozenPayload);
  }

  async function doSave(payload: ProductSavePayload) {
    setSaveState({ status: "saving" });

    const response = await new Promise<MessageResponse<SaveApiResponse>>(
      (resolve) => {
        chrome.runtime.sendMessage(
          { type: "SAVE_PRODUCT", payload },
          (resp) => {
            if (chrome.runtime.lastError) {
              resolve({
                ok: false,
                error:
                  chrome.runtime.lastError.message ?? "Unknown error",
              });
            } else {
              resolve(resp as MessageResponse<SaveApiResponse>);
            }
          }
        );
      }
    );

    if (response.ok) {
      const data = response.data;
      setSaveState({
        status: "success",
        materialId: data.materialId,
        path: data.path,
        replayed: data.replayed,
      });
      // Clear draft on success
      chrome.runtime.sendMessage({ type: "CLEAR_DRAFT" });
    } else {
      const errMsg = response.error ?? "Save failed";
      if (errMsg.startsWith("UNKNOWN:")) {
        const realMsg = errMsg.slice("UNKNOWN:".length);
        setSaveState({
          status: "unknown",
          requestId: payload.requestId,
          frozenPayload: payload,
          error: realMsg,
        });
      } else {
        const status400 = errMsg.includes("400");
        const status401 = errMsg.includes("401");
        const status413 = errMsg.includes("413") || errMsg.includes("too large");
        setSaveState({
          status: "error",
          error: errMsg,
          keepDraft: !status400 || status401 || status413,
        });
      }
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const isSaving = saveState.status === "saving";
  const saveDisabled = hasErrors || isSaving || !isConnected;

  const libraryLink =
    saveState.status === "success" && bspOrigin
      ? `${bspOrigin}/library/my-items?tab=materials&materialId=${saveState.materialId}`
      : null;

  return (
    <div style={s.container}>
      {/* Draft banner */}
      {draftBanner && (
        <div style={s.draftBanner}>
          <span>{draftBanner}</span>
          <button
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#888",
              fontSize: 13,
            }}
            onClick={() => setDraftBanner(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Extract button */}
      <button
        style={s.extractBtn}
        onClick={handleExtract}
        disabled={extracting || !activeTabId}
        type="button"
      >
        {extracting ? "Extracting…" : "Extract from page"}
      </button>

      {extractError && (
        <div style={{ ...s.warning, marginBottom: 10 }}>{extractError}</div>
      )}

      {/* Currency warning */}
      {currencyWarning && (
        <div style={s.warning}>{currencyWarning}</div>
      )}

      {/* Price candidates picker */}
      {priceCandidates.length > 1 && (
        <div style={{ ...s.section, marginBottom: 10 }}>
          <div style={s.sectionTitle}>Multiple prices found — pick one</div>
          <div style={s.priceCandidateList}>
            {priceCandidates.map((c, i) => (
              <div key={i} style={s.priceCandidateItem}>
                <button
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    background: "#B8962E",
                    color: "#fff",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    updateField("cost", String(c.value));
                    setPriceCandidates([]);
                  }}
                >
                  ${c.value.toFixed(2)}
                </button>
                <span style={{ color: "#666", fontSize: 11 }}>{c.context}</span>
              </div>
            ))}
            <button
              style={{
                fontSize: 11,
                padding: "2px 8px",
                background: "#f0f0f0",
                border: "1px solid #ccc",
                borderRadius: 4,
                cursor: "pointer",
                marginTop: 4,
              }}
              onClick={() => setPriceCandidates([])}
            >
              Skip (enter manually)
            </button>
          </div>
        </div>
      )}

      {/* Section 1: Images & Title */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Images &amp; Title</div>

        <ImageGallery
          imageUrls={form.imageUrls}
          selectedIndexes={form.selectedImageIndexes}
          onRemove={removeImage}
          onToggle={toggleImage}
          onAddUrl={addImageUrl}
          onPickImage={pickImage}
          error={errors.imageUrls}
        />

        <Field
          label="Title"
          hint="(required)"
          error={errors.title}
          autoFilled={autoFilled.has("title")}
        >
          <div style={s.pickRow}>
            <input
              style={{
                ...s.input,
                ...(errors.title ? s.inputError : {}),
                flex: 1,
              }}
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              maxLength={500}
              placeholder="Product title"
            />
            <button
              style={s.pickBtn}
              onClick={() => pickText("title")}
              type="button"
              title="Click a text element on the page"
            >
              Pick
            </button>
          </div>
        </Field>

        <Field label="Source URL" error={errors.sourceUrl} autoFilled={autoFilled.has("sourceUrl")}>
          {editingSourceUrl ? (
            <input
              {...inputProps("sourceUrl")}
              maxLength={8192}
              placeholder="https://…"
              onBlur={() => setEditingSourceUrl(false)}
              autoFocus
            />
          ) : (
            <div
              style={{
                fontSize: 12,
                color: "#555",
                wordBreak: "break-all",
                padding: "4px 0",
              }}
            >
              {form.sourceUrl || "(none)"}
              <button
                style={s.sourceUrlEditBtn}
                onClick={() => setEditingSourceUrl(true)}
                type="button"
              >
                edit
              </button>
            </div>
          )}
        </Field>
      </div>

      {/* Section 2: Pricing */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Pricing</div>

        <div style={s.row}>
          <Field
            label="Cost (USD)"
            hint="(blank = omit)"
            error={errors.cost}
            autoFilled={autoFilled.has("cost")}
          >
            <input
              {...inputProps("cost")}
              type="number"
              min="0"
              step="0.01"
              placeholder="Leave blank if unknown"
            />
          </Field>
          <Field label="MSRP (USD)" hint="(optional)" error={errors.msrp}>
            <input
              {...inputProps("msrp")}
              type="number"
              min="0"
              step="0.01"
              placeholder="Optional"
            />
          </Field>
        </div>

        <div style={s.row3}>
          <Field label="Markup %" error={errors.markupPercent}>
            <input
              {...inputProps("markupPercent")}
              type="number"
              min="0"
              max="1000"
              step="0.1"
            />
          </Field>
          <Field label="Quantity" error={errors.quantity}>
            <input
              {...inputProps("quantity")}
              type="number"
              min="0.001"
              step="any"
            />
          </Field>
          <Field label="Unit" error={errors.unit}>
            <input {...inputProps("unit")} placeholder="each" maxLength={500} />
          </Field>
        </div>

        <label style={s.checkboxLabel}>
          <input
            type="checkbox"
            style={s.checkbox}
            checked={form.taxable}
            onChange={(e) => updateField("taxable", e.target.checked)}
          />
          Taxable
        </label>

        <PricingPreview
          cost={form.cost}
          markupPercent={form.markupPercent}
          quantity={form.quantity}
          unit={form.unit}
        />
      </div>

      {/* Section 3: Product Info */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Product Info</div>

        <Field
          label="Client-facing description"
          error={errors.description}
          autoFilled={autoFilled.has("description")}
        >
          <textarea {...textareaProps("description")} rows={4} maxLength={20000} />
        </Field>

        <div style={s.row}>
          <Field label="Category" error={errors.category}>
            <input {...inputProps("category")} placeholder="Other" maxLength={500} />
          </Field>
          <Field
            label="Vendor / Supplier"
            autoFilled={autoFilled.has("supplierName")}
          >
            <input
              {...inputProps("supplierName")}
              placeholder="Supplier name"
              maxLength={200}
            />
          </Field>
        </div>
      </div>

      {/* Section 4: Destination */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Destination</div>
        <label style={{ ...s.checkboxLabel, marginBottom: 6 }}>
          <input type="radio" checked readOnly style={s.checkbox} />
          Library only
        </label>
        <div
          style={{
            ...s.placeholder,
            textAlign: "left",
            padding: "8px 10px",
          }}
        >
          Project &amp; board selection coming in Stage 4
        </div>
      </div>

      {/* Section 5: Attachments */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Attachments</div>
        <div style={s.placeholder}>File uploads coming in Stage 3</div>
      </div>

      {/* Additional Details (collapsible) */}
      <div style={s.section}>
        <button
          style={s.collapsibleBtn}
          onClick={() => setShowDetails((v) => !v)}
          type="button"
        >
          <span>{showDetails ? "▾" : "▸"}</span> Additional Details
        </button>

        {showDetails && (
          <div style={{ marginTop: 10 }}>
            <div style={s.row}>
              <Field
                label="Manufacturer"
                autoFilled={autoFilled.has("manufacturer")}
              >
                <input
                  {...inputProps("manufacturer")}
                  placeholder="Manufacturer"
                  maxLength={200}
                />
              </Field>
              <Field label="SKU" autoFilled={autoFilled.has("sku")}>
                <input {...inputProps("sku")} placeholder="SKU" maxLength={200} />
              </Field>
            </div>
            <div style={s.row}>
              <Field label="Dimensions" autoFilled={autoFilled.has("dimensions")}>
                <input
                  {...inputProps("dimensions")}
                  placeholder="e.g. 10×5×2 in"
                  maxLength={200}
                />
              </Field>
              <Field
                label="Finish / Color"
                autoFilled={autoFilled.has("finishColor")}
              >
                <input
                  {...inputProps("finishColor")}
                  placeholder="e.g. Brushed Nickel"
                  maxLength={200}
                />
              </Field>
            </div>
            <Field label="Materials" autoFilled={autoFilled.has("composition")}>
              <input
                {...inputProps("composition")}
                placeholder="e.g. Solid Oak"
                maxLength={200}
              />
            </Field>

            <Field label="Vendor description" hint="(internal)">
              <textarea
                {...textareaProps("vendorDescription")}
                rows={3}
                maxLength={20000}
              />
            </Field>

            <Field label="Internal notes">
              <textarea
                {...textareaProps("internalNotes")}
                rows={3}
                maxLength={20000}
              />
            </Field>

            <Field label="Tags" hint="(comma-separated, max 50)" error={errors.tags}>
              <input
                {...inputProps("tags")}
                placeholder="tag1, tag2, tag3"
              />
            </Field>
          </div>
        )}
      </div>

      {/* Save */}
      <button
        style={{
          ...s.saveBtn,
          ...(saveDisabled ? s.saveBtnDisabled : {}),
        }}
        onClick={handleSave}
        disabled={saveDisabled}
        type="button"
      >
        {isSaving ? "Saving…" : "Save to Library"}
      </button>

      {!isConnected && (
        <div style={{ ...s.errorText, textAlign: "center", marginTop: 6 }}>
          Not connected — configure settings first
        </div>
      )}

      {hasErrors && !isSaving && (
        <div
          style={{
            fontSize: 11,
            color: "#c0392b",
            textAlign: "center",
            marginTop: 4,
          }}
        >
          Please fix the errors above before saving
        </div>
      )}

      {/* Save result */}
      {saveState.status === "success" && (
        <div style={s.successBox}>
          {saveState.replayed ? (
            <strong>Already saved</strong>
          ) : (
            <strong>Saved to library!</strong>
          )}
          {libraryLink && (
            <>
              {" "}
              <a
                href={libraryLink}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#1a7a45" }}
              >
                Open library product
              </a>
            </>
          )}
        </div>
      )}

      {saveState.status === "unknown" && (
        <div style={s.unknownOutcome}>
          <strong>Save outcome unknown</strong> — {saveState.error}
          <br />
          <button
            style={{
              marginTop: 8,
              fontSize: 12,
              padding: "4px 10px",
              background: "#ffc107",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: 600,
            }}
            onClick={() => handleRetry(saveState.frozenPayload)}
            type="button"
          >
            Retry
          </button>
        </div>
      )}

      {saveState.status === "error" && (
        <div
          style={{
            background: "#fdecea",
            border: "1px solid #f5c6cb",
            borderRadius: 6,
            padding: "10px 12px",
            fontSize: 12,
            color: "#721c24",
            marginTop: 8,
          }}
        >
          {saveState.error}
        </div>
      )}
    </div>
  );
}
