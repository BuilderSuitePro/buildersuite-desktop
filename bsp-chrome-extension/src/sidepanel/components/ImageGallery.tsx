import React, { useState } from "react";

interface ImageGalleryProps {
  imageUrls: string[];
  selectedIndexes: boolean[];
  onRemove: (index: number) => void;
  onToggle: (index: number) => void;
  onAddUrl: (url: string) => void;
  onPickImage: () => void;
  error?: string;
}

const s: Record<string, React.CSSProperties> = {
  container: { marginBottom: 12 },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "#444",
    marginBottom: 6,
    display: "block",
  },
  grid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  thumbnail: {
    position: "relative",
    width: 70,
    height: 70,
    borderRadius: 4,
    overflow: "hidden",
    border: "2px solid #ddd",
    background: "#f5f5f5",
    flexShrink: 0,
  },
  thumbnailSelected: {
    border: "2px solid #B8962E",
  },
  img: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  removeBtn: {
    position: "absolute",
    top: 2,
    right: 2,
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    border: "none",
    borderRadius: 3,
    width: 18,
    height: 18,
    fontSize: 10,
    lineHeight: "18px",
    textAlign: "center",
    cursor: "pointer",
    padding: 0,
  },
  checkboxRow: {
    position: "absolute",
    bottom: 2,
    left: 2,
  },
  checkbox: {
    cursor: "pointer",
    accentColor: "#B8962E",
  },
  addRow: {
    display: "flex",
    gap: 6,
    alignItems: "center",
    marginTop: 4,
  },
  urlInput: {
    flex: 1,
    fontSize: 11,
    padding: "4px 6px",
    border: "1px solid #ccc",
    borderRadius: 4,
    outline: "none",
    minWidth: 0,
  },
  addBtn: {
    fontSize: 11,
    padding: "4px 8px",
    background: "#f0f0f0",
    border: "1px solid #ccc",
    borderRadius: 4,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  pickBtn: {
    fontSize: 11,
    padding: "4px 8px",
    background: "#f0f0f0",
    border: "1px solid #ccc",
    borderRadius: 4,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  hint: {
    fontSize: 10,
    color: "#999",
    marginTop: 3,
  },
  error: {
    fontSize: 11,
    color: "#c0392b",
    marginTop: 3,
  },
};

export default function ImageGallery({
  imageUrls,
  selectedIndexes,
  onRemove,
  onToggle,
  onAddUrl,
  onPickImage,
  error,
}: ImageGalleryProps) {
  const [urlInput, setUrlInput] = useState("");

  function handleAdd() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    onAddUrl(trimmed);
    setUrlInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div style={s.container}>
      <label style={s.label}>Images (up to 5 selected)</label>

      {imageUrls.length > 0 && (
        <div style={s.grid}>
          {imageUrls.map((url, i) => (
            <div
              key={i}
              style={{
                ...s.thumbnail,
                ...(selectedIndexes[i] ? s.thumbnailSelected : {}),
              }}
            >
              <img
                src={url}
                alt={`Product image ${i + 1}`}
                style={s.img}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <button
                style={s.removeBtn}
                title="Remove"
                onClick={() => onRemove(i)}
              >
                ×
              </button>
              <div style={s.checkboxRow}>
                <input
                  type="checkbox"
                  style={s.checkbox}
                  checked={selectedIndexes[i] ?? false}
                  onChange={() => onToggle(i)}
                  title="Include in save"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={s.addRow}>
        <input
          style={s.urlInput}
          type="url"
          placeholder="Paste image URL…"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button style={s.addBtn} onClick={handleAdd} type="button">
          Add URL
        </button>
        <button style={s.pickBtn} onClick={onPickImage} type="button">
          Pick
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}
      <div style={s.hint}>
        Check images to include. First checked = cover. Max 5 in save payload.
      </div>
    </div>
  );
}
