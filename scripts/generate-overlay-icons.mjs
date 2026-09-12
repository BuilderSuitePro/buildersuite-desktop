// Windows taskbar overlay digits.
//
// Electron's badge APIs are Linux/macOS only, so on Windows the unread count is
// drawn as an overlay icon instead. nativeImage cannot render text, so the
// digits are baked here at build time and shipped as resources. That also keeps
// the tray working offline.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "build", "overlays");
mkdirSync(out, { recursive: true });

const AMBER = "#F59E0B";
const CHROME = "#1a1d21";
const SIZE = 32;

function svg(label) {
  const fontSize = label.length > 1 ? 17 : 21;
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <circle cx="16" cy="16" r="15" fill="${AMBER}"/>
  <text x="16" y="16" fill="${CHROME}"
        font-family="Segoe UI, Helvetica, Arial, sans-serif"
        font-size="${fontSize}" font-weight="700"
        text-anchor="middle" dominant-baseline="central">${label}</text>
</svg>`);
}

const labels = [...Array(9)].map((_, i) => [String(i + 1), String(i + 1)]);
labels.push(["9plus", "9+"]);

for (const [name, label] of labels) {
  await sharp(svg(label)).png().toFile(join(out, `badge-${name}.png`));
}

console.log(`generated ${labels.length} overlay icons`);
