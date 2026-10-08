import React from "react";
import { computePricingPreview } from "../../shared/validation.js";

interface PricingPreviewProps {
  cost: string;
  markupPercent: string;
  quantity: string;
  unit: string;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const s: Record<string, React.CSSProperties> = {
  container: {
    background: "#f8f6ef",
    border: "1px solid #e8d98a",
    borderRadius: 6,
    padding: "8px 12px",
    marginTop: 8,
    fontSize: 12,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  label: {
    color: "#666",
  },
  value: {
    fontWeight: 600,
    color: "#333",
  },
  unknown: {
    color: "#999",
    fontStyle: "italic",
  },
};

export default function PricingPreview({
  cost,
  markupPercent,
  quantity,
  unit,
}: PricingPreviewProps) {
  const preview = computePricingPreview(cost, markupPercent, quantity);

  return (
    <div style={s.container}>
      <div style={s.row}>
        <span style={s.label}>Unit selling price:</span>
        {preview.hasPrice && preview.unitSellingPrice !== null ? (
          <span style={s.value}>${fmt(preview.unitSellingPrice)}</span>
        ) : (
          <span style={s.unknown}>Price unknown</span>
        )}
      </div>
      <div style={s.row}>
        <span style={s.label}>
          Total ({quantity || "1"} {unit || "each"}):
        </span>
        {preview.hasPrice && preview.total !== null ? (
          <span style={s.value}>${fmt(preview.total)}</span>
        ) : (
          <span style={s.unknown}>—</span>
        )}
      </div>
    </div>
  );
}
