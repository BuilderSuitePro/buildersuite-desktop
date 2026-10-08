import React from "react";
import type { VerificationState } from "../../types/index.js";

interface Props {
  state: VerificationState;
}

function formatVerifiedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function ConnectionStatus({ state }: Props) {
  const containerStyle: React.CSSProperties = {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 6,
    fontSize: 13,
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    ...statusStyles[state.status],
  };

  return (
    <div style={containerStyle} role="status" aria-live="polite">
      <span style={{ fontSize: 16, lineHeight: 1.3 }}>
        {statusIcon[state.status]}
      </span>
      <div>
        <div style={{ fontWeight: 600 }}>{statusLabel[state.status]}</div>
        {state.status === "verified" && state.connectionName && (
          <div style={{ marginTop: 2, color: "#1a6e2e" }}>
            {state.connectionName}
          </div>
        )}
        {state.status === "verified" && state.verifiedAt && (
          <div style={{ marginTop: 2, color: "#555", fontSize: 11 }}>
            Last checked: {formatVerifiedAt(state.verifiedAt)}
          </div>
        )}
        {state.status === "failed" && state.error && (
          <div style={{ marginTop: 2, color: "#7d1f1f", fontSize: 12 }}>
            {state.error}
          </div>
        )}
      </div>
    </div>
  );
}

const statusStyles: Record<VerificationState["status"], React.CSSProperties> = {
  unverified: {
    background: "#f5f5f5",
    border: "1px solid #ddd",
    color: "#666",
  },
  verifying: {
    background: "#fefae8",
    border: "1px solid #e8d48a",
    color: "#7a5e00",
  },
  verified: {
    background: "#edfaf1",
    border: "1px solid #82c99b",
    color: "#1a6e2e",
  },
  failed: {
    background: "#fdf0f0",
    border: "1px solid #e8a0a0",
    color: "#7d1f1f",
  },
};

const statusIcon: Record<VerificationState["status"], string> = {
  unverified: "○",
  verifying: "⟳",
  verified: "✓",
  failed: "✗",
};

const statusLabel: Record<VerificationState["status"], string> = {
  unverified: "Not verified",
  verifying: "Verifying…",
  verified: "Connection verified",
  failed: "Verification failed",
};
