import React, { useCallback, useEffect, useRef, useState } from "react";
import type { BspSettings, MessageResponse, VerificationState } from "../../types/index.js";
import { validateSettings } from "../../shared/validation.js";
import ConnectionStatus from "./ConnectionStatus.js";

interface Props {
  initialSettings: BspSettings | null;
  initialVerification: VerificationState | null;
}

const EMPTY: BspSettings = {
  bspOrigin: "",
  verificationUrl: "",
  productUrl: "",
  connectionKey: "",
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  section: { marginBottom: 0 },
  sectionTitle: {
    fontWeight: 700,
    fontSize: 13,
    color: "#2D2D2D",
    marginBottom: 14,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    borderBottom: "2px solid #B8962E",
    paddingBottom: 6,
  },
  fieldGroup: { marginBottom: 14 },
  label: {
    display: "block",
    fontWeight: 600,
    fontSize: 12,
    color: "#2D2D2D",
    marginBottom: 4,
  },
  input: {
    width: "100%",
    padding: "7px 10px",
    border: "1px solid #ccc",
    borderRadius: 5,
    fontSize: 13,
    color: "#2D2D2D",
    background: "#fff",
    outline: "none",
    transition: "border-color 0.15s",
  },
  inputError: {
    borderColor: "#c0392b",
  },
  inputWrapper: {
    position: "relative",
  },
  showHideBtn: {
    position: "absolute",
    right: 8,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#888",
    fontSize: 12,
    padding: "2px 4px",
    lineHeight: 1,
  },
  errorHint: {
    color: "#c0392b",
    fontSize: 11,
    marginTop: 3,
    display: "block",
  },
  hint: {
    color: "#888",
    fontSize: 11,
    marginTop: 3,
    display: "block",
  },
  btnRow: {
    display: "flex",
    gap: 8,
    marginTop: 18,
  },
  btnPrimary: {
    flex: 1,
    padding: "9px 14px",
    background: "#B8962E",
    color: "#fff",
    border: "none",
    borderRadius: 5,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  btnSecondary: {
    flex: 1,
    padding: "9px 14px",
    background: "#2D2D2D",
    color: "#fff",
    border: "none",
    borderRadius: 5,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  btnDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  savedBadge: {
    display: "inline-block",
    color: "#1a6e2e",
    fontSize: 12,
    marginLeft: 6,
    verticalAlign: "middle",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsPanel({ initialSettings, initialVerification }: Props) {
  const [draft, setDraft] = useState<BspSettings>(initialSettings ?? EMPTY);
  const [saved, setSaved] = useState<BspSettings | null>(initialSettings);
  const [verification, setVerification] = useState<VerificationState>(
    initialVerification ?? { status: "unverified" }
  );
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const saveOkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validation = validateSettings(draft);
  const isDirty =
    saved === null ||
    Object.keys(EMPTY).some(
      (k) => draft[k as keyof BspSettings] !== (saved?.[k as keyof BspSettings] ?? "")
    );

  // Clear verification state when any field is edited
  useEffect(() => {
    if (isDirty && verification.status !== "unverified") {
      setVerification({ status: "unverified" });
    }
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback(
    (field: keyof BspSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setDraft((prev) => ({ ...prev, [field]: e.target.value }));
      setSaveOk(false);
    },
    []
  );

  const handleSave = async () => {
    if (!validation.valid || saving) return;
    setSaving(true);
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "SAVE_SETTINGS", settings: draft },
          (response: MessageResponse) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!response.ok) {
              reject(new Error(response.error));
              return;
            }
            resolve();
          }
        );
      });
      setSaved(draft);
      setVerification({ status: "unverified" });
      setSaveOk(true);
      if (saveOkTimer.current) clearTimeout(saveOkTimer.current);
      saveOkTimer.current = setTimeout(() => setSaveOk(false), 3000);
    } catch (err) {
      console.warn("[BSP] Save failed:", err instanceof Error ? err.message : err);
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    if (verifying || isDirty || !saved) return;
    setVerifying(true);
    setVerification({ status: "verifying" });
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "VERIFY_CONNECTION" },
          (response: MessageResponse<VerificationState>) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!response.ok) {
              setVerification({ status: "failed", error: response.error });
              resolve();
              return;
            }
            setVerification(response.data);
            resolve();
          }
        );
      });
    } catch (err) {
      setVerification({
        status: "failed",
        error: err instanceof Error ? err.message : "Verification failed",
      });
    } finally {
      setVerifying(false);
    }
  };

  const canSave = validation.valid && !saving;
  const canVerify = !isDirty && saved !== null && !verifying && !saving;

  return (
    <div style={s.section}>
      <div style={s.sectionTitle}>Connection Settings</div>

      <Field
        label="BSP Web App Origin"
        hint="e.g. https://app.buildersuitepro.com (from BSP → Integrations)"
        error={validation.errors.bspOrigin}
        htmlFor="bsp-origin"
      >
        <input
          id="bsp-origin"
          type="url"
          value={draft.bspOrigin}
          onChange={handleChange("bspOrigin")}
          style={{
            ...s.input,
            ...(validation.errors.bspOrigin ? s.inputError : {}),
          }}
          placeholder="https://app.buildersuitepro.com"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>

      <Field
        label="Verification URL"
        hint="Copied from BSP → Integrations → Clipper Connect. Must end with /clipper/verify"
        error={validation.errors.verificationUrl}
        htmlFor="verification-url"
      >
        <input
          id="verification-url"
          type="url"
          value={draft.verificationUrl}
          onChange={handleChange("verificationUrl")}
          style={{
            ...s.input,
            ...(validation.errors.verificationUrl ? s.inputError : {}),
          }}
          placeholder="https://api.buildersuitepro.com/clipper/verify"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>

      <Field
        label="v2 Product URL"
        hint="Copied from BSP → Integrations → Clipper Connect. Must end with /clipper/v2/products"
        error={validation.errors.productUrl}
        htmlFor="product-url"
      >
        <input
          id="product-url"
          type="url"
          value={draft.productUrl}
          onChange={handleChange("productUrl")}
          style={{
            ...s.input,
            ...(validation.errors.productUrl ? s.inputError : {}),
          }}
          placeholder="https://api.buildersuitepro.com/clipper/v2/products"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>

      <Field
        label="Connection Key"
        hint="Bearer token from BSP → Integrations → Clipper Connect"
        error={validation.errors.connectionKey}
        htmlFor="connection-key"
      >
        <div style={s.inputWrapper}>
          <input
            id="connection-key"
            type={showKey ? "text" : "password"}
            value={draft.connectionKey}
            onChange={handleChange("connectionKey")}
            style={{
              ...s.input,
              paddingRight: 52,
              ...(validation.errors.connectionKey ? s.inputError : {}),
            }}
            placeholder="Paste your connection key"
            autoComplete="new-password"
            spellCheck={false}
          />
          <button
            type="button"
            style={s.showHideBtn}
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? "Hide connection key" : "Show connection key"}
          >
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
      </Field>

      <div style={s.btnRow}>
        <button
          type="button"
          style={{ ...s.btnPrimary, ...(canSave ? {} : s.btnDisabled) }}
          disabled={!canSave}
          onClick={handleSave}
          aria-disabled={!canSave}
        >
          {saving ? "Saving…" : "Save Settings"}
          {saveOk && <span style={s.savedBadge}>✓</span>}
        </button>

        <button
          type="button"
          style={{ ...s.btnSecondary, ...(canVerify ? {} : s.btnDisabled) }}
          disabled={!canVerify}
          onClick={handleVerify}
          aria-disabled={!canVerify}
        >
          {verifying ? "Verifying…" : "Verify Connection"}
        </button>
      </div>

      {isDirty && saved !== null && (
        <p style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
          Save your settings before verifying.
        </p>
      )}

      <ConnectionStatus state={verification} />
    </div>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div style={s.fieldGroup}>
      <label htmlFor={htmlFor} style={s.label}>
        {label}
      </label>
      {children}
      {error ? (
        <span style={s.errorHint} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span style={s.hint}>{hint}</span>
      ) : null}
    </div>
  );
}
