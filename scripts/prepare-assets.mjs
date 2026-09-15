// Turns the downloaded brand art in build/_src into the exact sizes and formats
// electron-builder and the tray need. Re-runnable; safe to run on every build.
//
// The two app icons are COMPOSED here rather than shipped as finished art. The
// drawings in build/_src carry the brand marks; mac, Windows and the tray each
// want a different shape around them, and mac additionally wants different
// artwork per size. Everything under build/suite and build/teams is generated
// and committed, because CI deliberately never runs this script — it shells out
// to sips and iconutil, so it only works on macOS.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "build", "_src");
const build = join(root, "build");
const tmp = join(build, "_tmp");

const ensure = (p) => mkdirSync(p, { recursive: true });

// ---------------------------------------------------------------------------
// Raw RGBA plumbing
// ---------------------------------------------------------------------------
//
// The icons are composited on plain buffers rather than through sharp's
// composite(), which only takes integer offsets; placing a mark on an exact
// optical centre needs sub-pixel placement at the small sizes.

/** { w, h, data } at 4 bytes per pixel, non-premultiplied. */
const rgba = (w, h) => ({ w, h, data: Buffer.alloc(w * h * 4) });

/** { w, h, data } at 1 byte per pixel. Coverage masks. */
const gray = (w, h) => ({ w, h, data: Buffer.alloc(w * h) });

async function readRgba(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, data };
}

const asSharp = (img) =>
  sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } });

const asSharpGray = (img) =>
  sharp(img.data, { raw: { width: img.w, height: img.h, channels: 1 } });

const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Source-over composite of src onto dst, src's top-left at (dx, dy). */
function over(dst, src, dx, dy) {
  const ox = Math.round(dx);
  const oy = Math.round(dy);
  for (let y = 0; y < src.h; y++) {
    const ty = y + oy;
    if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const tx = x + ox;
      if (tx < 0 || tx >= dst.w) continue;
      const s = (y * src.w + x) * 4;
      const sa = src.data[s + 3] / 255;
      if (sa === 0) continue;
      const d = (ty * dst.w + tx) * 4;
      const da = dst.data[d + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        dst.data[d + c] = clamp8(
          (src.data[s + c] * sa + dst.data[d + c] * da * (1 - sa)) / oa,
        );
      }
      dst.data[d + 3] = clamp8(oa * 255);
    }
  }
  return dst;
}

/** Paints a flat colour through a coverage mask. */
function tint(mask, [r, g, b], opacity = 1) {
  const out = rgba(mask.w, mask.h);
  for (let i = 0; i < mask.w * mask.h; i++) {
    out.data[i * 4] = r;
    out.data[i * 4 + 1] = g;
    out.data[i * 4 + 2] = b;
    out.data[i * 4 + 3] = clamp8(mask.data[i] * opacity);
  }
  return out;
}

/**
 * Reads one channel back out of a sharp pipeline as a coverage mask.
 *
 * Needed because sharp hands a single-channel input back as interleaved sRGB
 * unless it is told otherwise, so reading the buffer at a stride of one byte
 * silently gets every third pixel. The channel count is checked rather than
 * assumed.
 */
async function toMask(pipeline, w, h) {
  const { data, info } = await pipeline
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels === 1) return { w, h, data };
  const out = Buffer.alloc(w * h);
  for (let i = 0; i < out.length; i++) out[i] = data[i * info.channels];
  return { w, h, data: out };
}

/** Gaussian blur of a coverage mask. sharp refuses a sigma below 0.3. */
function blurMask(mask, sigma) {
  return toMask(asSharpGray(mask).blur(Math.max(0.3, sigma)), mask.w, mask.h);
}

/**
 * Scales an RGBA image. Routed through PNG rather than raw so sharp
 * premultiplies before filtering; resampling non-premultiplied alpha drags the
 * transparent background's colour into every soft edge.
 */
async function scaleRgba(img, factor) {
  const w = Math.max(1, Math.round(img.w * factor));
  const h = Math.max(1, Math.round(img.h * factor));
  const png = await asSharp(img).png().toBuffer();
  const { data, info } = await sharp(png)
    .resize(w, h, { kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, data };
}

function cloneRgba(img) {
  return { w: img.w, h: img.h, data: Buffer.from(img.data) };
}

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

const hex = ([r, g, b]) =>
  "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

// ---------------------------------------------------------------------------
// Brand colours
// ---------------------------------------------------------------------------
//
// Sampled out of the original art instead of typed in from a style guide, so
// that redrawing anything in build/_src carries its own colours through here
// rather than silently disagreeing with a hard-coded hex value.

/**
 * Most common dark, near-neutral colour in a region — the flat navy plate a
 * mark was drawn on. The colour tests skip the gold and the warm near-black
 * inside the letterform's counters, and the mode rather than the mean ignores
 * the art's faint dither.
 */
async function sampleNavy(file, box) {
  const img = await readRgba(file);
  const counts = new Map();
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const i = (y * img.w + x) * 4;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      if (r > 70 || g > 75 || b > 80 || Math.abs(r - b) > 28) continue;
      const key = (r << 16) | (g << 8) | b;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best = 0;
  let bestKey = 0;
  for (const [key, n] of counts) {
    if (n > best) {
      best = n;
      bestKey = key;
    }
  }
  return [(bestKey >> 16) & 255, (bestKey >> 8) & 255, bestKey & 255];
}

// Where each drawing keeps its mark, and where to read the plate under it.
//
// suite-icon.png is a navy tile floating on an opaque WHITE canvas — the white
// box Kevin sees in the dock. Both the search and the plate sample are held
// inside the tile, past its ~26px lighter edge bevel, because the white canvas
// is brighter than the gold and would otherwise key as part of the mark.
// teams-icon.png is full-bleed navy, so its mark can be searched for anywhere
// and its plate comes off the border above the bubble.
const SUITE_REGION = { x0: 110, y0: 110, x1: 915, y1: 915 };
const TEAMS_REGION = { x0: 0, y0: 0, x1: 1023, y1: 1023 };
const TEAMS_PLATE_BOX = { x0: 0, y0: 0, x1: 1023, y1: 140 };

// ---------------------------------------------------------------------------
// Mark extraction
// ---------------------------------------------------------------------------
//
// The B and the speech bubble are hand-drawn letterforms that have to survive
// intact, so they are lifted out of the existing PNGs rather than redrawn.
//
// Keying the gold directly would mean guessing how much of every antialiased
// edge pixel is gold, and any error in that guess shows as a fringe. Instead
// the silhouette is grown outwards, feathered, and the ORIGINAL pixels are
// carried through that matte, so every gold pixel and every edge pixel arrives
// untouched and the only blending happens navy-on-navy.

/** Feather distance around the silhouette. Comfortably inside any tile padding. */
const MATTE_FEATHER = 18;

async function extractMark(file, { region, plateBox }, brandNavy) {
  const img = await readRgba(file);
  const plate = await sampleNavy(file, plateBox);
  const plateLuma = luma(...plate);
  // Gold runs far brighter than the navy it is drawn on, so luminance alone
  // separates them. LO clears the plate and its dither; HI sits halfway to the
  // mark's own median gold, which puts every interior pixel at full coverage
  // and leaves the ramp for genuine edges.
  const golds = [];
  const cover = gray(img.w, img.h);
  for (let y = region.y0; y <= region.y1; y++) {
    for (let x = region.x0; x <= region.x1; x++) {
      const i = (y * img.w + x) * 4;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      if (r > 90 && r - b > 45 && g > b) golds.push(luma(r, g, b));
    }
  }
  golds.sort((a, b) => a - b);
  const medianGold = golds[Math.floor(golds.length / 2)];
  const lo = plateLuma + 6;
  const hi = lo + 0.5 * (medianGold - lo);

  for (let y = region.y0; y <= region.y1; y++) {
    for (let x = region.x0; x <= region.x1; x++) {
      const i = (y * img.w + x) * 4;
      const l = luma(img.data[i], img.data[i + 1], img.data[i + 2]);
      cover.data[y * img.w + x] = clamp8(
        255 * Math.min(1, Math.max(0, (l - lo) / (hi - lo))),
      );
    }
  }

  let x0 = img.w;
  let y0 = img.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (cover.data[y * img.w + x] < 128) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }

  // Grow the silhouette into a matte: blur, then lift the mid-tones so the core
  // stays solid several pixels out and only the rim keeps a ramp.
  const blurred = await blurMask(cover, MATTE_FEATHER / 3);
  const matte = gray(img.w, img.h);
  for (let i = 0; i < matte.data.length; i++) {
    matte.data[i] = Math.min(255, blurred.data[i] * 5);
  }

  // Clamped to the region as well as the canvas, so the feather can never pull
  // in whatever sits outside it.
  const cx0 = Math.max(region.x0, x0 - MATTE_FEATHER);
  const cy0 = Math.max(region.y0, y0 - MATTE_FEATHER);
  const cx1 = Math.min(region.x1, x1 + MATTE_FEATHER);
  const cy1 = Math.min(region.y1, y1 + MATTE_FEATHER);
  const cw = cx1 - cx0 + 1;
  const ch = cy1 - cy0 + 1;

  // The two drawings sit on plates a few levels apart, and the new tile is one
  // flat navy, so carrying the original plate through the matte would ring the
  // mark with a faint halo. Shifting each pixel by the plate difference in
  // proportion to how much plate it contains cancels that exactly: full-gold
  // pixels are untouched, pure plate becomes the brand navy, and edge pixels
  // land on the blend they would have had if drawn on the brand navy to start.
  const shift = [0, 1, 2].map((c) => brandNavy[c] - plate[c]);

  const art = rgba(cw, ch);
  const mask = gray(cw, ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const s = (y + cy0) * img.w + (x + cx0);
      const d = y * cw + x;
      const c = cover.data[s] / 255;
      for (let k = 0; k < 3; k++) {
        art.data[d * 4 + k] = clamp8(img.data[s * 4 + k] + (1 - c) * shift[k]);
      }
      art.data[d * 4 + 3] = matte.data[s];
      mask.data[d] = cover.data[s];
    }
  }

  return {
    art,
    mask,
    /** The silhouette's own box, in the cropped image's coordinates. */
    box: { x: x0 - cx0, y: y0 - cy0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    plate,
  };
}

/**
 * Replaces a mark's interior with a smooth gradient built from its own row
 * averages. Both drawings carry hairline blueprint grids that hold together to
 * about 64px and then break into grey speckle; this keeps the exact silhouette
 * and the original top-to-bottom gold gradient while dropping the detail that
 * cannot survive 16 and 32px.
 */
function simplify(mark) {
  const { mask, box } = mark;
  const rows = [];
  for (let y = 0; y < mask.h; y++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let x = 0; x < mask.w; x++) {
      if (mask.data[y * mask.w + x] < 200) continue;
      const i = (y * mask.w + x) * 4;
      r += mark.art.data[i];
      g += mark.art.data[i + 1];
      b += mark.art.data[i + 2];
      n++;
    }
    rows.push(n > 0 ? [r / n, g / n, b / n] : null);
  }

  // Carry the nearest covered row into empty ones, then smooth, so the fill has
  // no steps where the silhouette narrows.
  for (let y = 0; y < rows.length; y++) {
    if (rows[y]) continue;
    let up = y;
    let down = y;
    while (up >= 0 && !rows[up]) up--;
    while (down < rows.length && !rows[down]) down++;
    rows[y] = rows[up] ?? rows[down] ?? [0, 0, 0];
  }
  const span = Math.max(2, Math.round(box.h * 0.08));
  const art = rgba(mask.w, mask.h);
  for (let y = 0; y < mask.h; y++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let k = -span; k <= span; k++) {
      const row = rows[y + k];
      if (!row) continue;
      r += row[0];
      g += row[1];
      b += row[2];
      n++;
    }
    for (let x = 0; x < mask.w; x++) {
      const d = (y * mask.w + x) * 4;
      art.data[d] = clamp8(r / n);
      art.data[d + 1] = clamp8(g / n);
      art.data[d + 2] = clamp8(b / n);
      art.data[d + 3] = mask.data[y * mask.w + x];
    }
  }
  return { art, mask, box };
}

/** Coverage-weighted centre of a mark's ink, in the mark's own coordinates. */
function inkCentroid(mask) {
  let sx = 0;
  let sy = 0;
  let total = 0;
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      const w = mask.data[y * mask.w + x];
      if (w === 0) continue;
      sx += x * w;
      sy += y * w;
      total += w;
    }
  }
  return { x: sx / total, y: sy / total };
}

// How much of the box-centre-to-centroid difference to apply.
//
// Not the full amount. Landing the mass exactly on centre pushes the bounding
// box ~15px the other way at 1024px, and then the B's right bowl visibly
// crowds the tile edge while its left stem has room to spare — the icon reads
// as shifted right instead of left. Neither extreme is correct, because the eye
// weighs the mass and the silhouette's extents at the same time. Seven tenths
// was chosen by rendering 100% and 70% side by side against a centre crosshair
// at 384 and 128px and picking the one with even margins.
const OPTICAL_CORRECTION = 0.7;

/**
 * Scales a mark so its silhouette is `width` wide, then lays it on dst at
 * (cx, cy).
 *
 * `optical` anchors the mark's centre of ink there instead of the centre of its
 * bounding box. The B is not a symmetric shape — a solid vertical stem down the
 * left against two bowls that round off and taper away on the right — so its
 * mass sits left of and above its box centre, and box-centring makes it read as
 * shifted left and slightly high even though the box is dead centre. This is
 * deliberate, not a leftover bug.
 *
 * The speech bubble stays box-centred on the tile: its tail is a deliberate
 * part of the silhouette rather than stray weight, and centring the bubble's
 * mass would lift the body above the optical centre instead of settling it on
 * it. The B knocked into that bubble is optically centred like any other.
 */
async function placeMark(dst, mark, { width, cx, cy, optical = false }) {
  const factor = width / mark.box.w;
  let ax = mark.box.x + mark.box.w / 2;
  let ay = mark.box.y + mark.box.h / 2;
  if (optical) {
    const ink = inkCentroid(mark.mask);
    ax += OPTICAL_CORRECTION * (ink.x - ax);
    ay += OPTICAL_CORRECTION * (ink.y - ay);
  }
  const scaled = await scaleRgba(mark.art, factor);
  return over(dst, scaled, cx - ax * factor, cy - ay * factor);
}

// ---------------------------------------------------------------------------
// The teams mark: the bubble with the B knocked into it
// ---------------------------------------------------------------------------

/**
 * Without this, nothing on the BuilderTeams icon says it belongs to
 * BuilderSuite Pro.
 *
 * The B is centred on the bubble's BODY, not on the whole shape: the tail hangs
 * off the bottom-left, which drags the shape's geometric centre well below the
 * body's, and a B centred on that looks like it is sagging out of the bubble.
 */
async function bubbleWithB(bubble, bMark, brandNavy, bWidth) {
  // Bottom edge of the body, read off the mask rather than hard-coded. Columns
  // in the right 55% of the bubble are clear of the tail, so the lowest row
  // they reach is the body's own bottom edge.
  let bodyBottom = bubble.box.y;
  for (let x = Math.round(bubble.box.x + bubble.box.w * 0.45); x < bubble.box.x + bubble.box.w; x++) {
    for (let y = bubble.mask.h - 1; y >= 0; y--) {
      if (bubble.mask.data[y * bubble.mask.w + x] < 128) continue;
      if (y > bodyBottom) bodyBottom = y;
      break;
    }
  }

  const art = cloneRgba(bubble.art);
  await placeMark(
    art,
    { art: tint(bMark.mask, brandNavy), mask: bMark.mask, box: bMark.box },
    {
      width: bubble.box.w * bWidth,
      cx: bubble.box.x + bubble.box.w / 2,
      cy: (bubble.box.y + bodyBottom) / 2,
      optical: true,
    },
  );

  return { art, mask: bubble.mask, box: bubble.box, bodyBottom };
}

// ---------------------------------------------------------------------------
// macOS tile geometry
// ---------------------------------------------------------------------------
//
// Measured off the system icons rather than guessed: Mail, Messages, Music,
// Podcasts and FaceTime all share one silhouette, and in it the tile body is
// 80.92% of the canvas, leaving ~98px of transparent padding per side at
// 1024px. macOS does not mask app icons the way iOS does, so the padding and
// the corner shape both have to be part of the artwork — without the padding
// the icon renders oversized beside native apps.
const MAC_BODY = 0.80919;

// Apple does not keep that one ratio all the way down. At 16 and 32px the
// padding drops to 1 and 2 pixels — a body 87.5% of the canvas — because the
// proportional 98/1024 padding would leave a 13px tile that reads as a speck.
// Measured on the same icons, which ship 16 and 32px art of their own.
const MAC_BODY_SMALL = 0.875;

/** 16 and 32px: hairline-free art, a tighter tile and a larger mark. */
const isSmall = (size) => size <= 32;
const macBody = (size) => (isSmall(size) ? MAC_BODY_SMALL : MAC_BODY);

// That corner is a continuous-curvature curve, not a circular arc. Fitted to
// the measured outline, a superellipse |dx/R|^n + |dy/R|^n = 1 lands on a reach
// of 0.32 of the side at n = 3, which tracks Apple's edge to 1.1px rms and 9px
// worst case at 1024px. The best circular corner that can be fitted to the same
// outline is out by 2.6px rms and 24px worst case — that error is what makes a
// plain rounded rect read as a square chip beside native icons.
//
// Note "reach" is how far the corner runs along each edge, not a rounded-rect
// radius: the tightest curvature on this curve works out at ~149px on an 828px
// body, while the corner starts turning 265px from the end of the edge.
const MAC_CORNER = 0.32;
const MAC_CORNER_N = 3;

// Apple bakes a short, soft shadow into the artwork as well. Measured on the
// same icons: alpha just under the bottom edge is 0.24, decaying to nothing
// over ~40px at 1024px, above a barely-there 0.04 halo. A downward-offset blur
// at these settings reproduces that profile to within about 0.03 alpha.
// The shadow all but vanishes on Apple's 16px art — a symmetric 0.15 edge and
// nothing at all below it — so it is dropped there rather than smeared into a
// ring of grime around a 14px tile. The offset is floored at a whole pixel so
// that wherever it is drawn it still reads as coming from above.
const MAC_SHADOW_SIGMA = 14;
const MAC_SHADOW_OFFSET = 10;
const MAC_SHADOW_OPACITY = 0.3;
const MAC_SHADOW_MIN_SIZE = 32;

/**
 * Superellipse-cornered square as an SVG path.
 *
 * Each corner is emitted as a polyline; at this sample count the chord error is
 * under a thousandth of a pixel, and the path is rendered at 2x and filtered
 * down so the edge antialiasing is clean.
 */
function squirclePath(size, side, reach, exponent, samples = 256) {
  const m = 2 / exponent;
  const x0 = (size - side) / 2;
  const y0 = x0;
  const x1 = x0 + side;
  const y1 = y0 + side;

  // p(t) = c + u * cos(t)^m + v * sin(t)^m, over a quarter turn.
  const arc = (cx, cy, ux, uy, vx, vy) => {
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * (Math.PI / 2);
      const c = Math.cos(t) ** m;
      const s = Math.sin(t) ** m;
      pts.push(`${(cx + ux * c + vx * s).toFixed(3)} ${(cy + uy * c + vy * s).toFixed(3)}`);
    }
    return pts.join(" L ");
  };

  const r = reach;
  return [
    `M ${x0 + r} ${y0}`,
    `L ${x1 - r} ${y0}`,
    `L ${arc(x1 - r, y0 + r, 0, -r, r, 0)}`,
    `L ${x1} ${y1 - r}`,
    `L ${arc(x1 - r, y1 - r, r, 0, 0, r)}`,
    `L ${x0 + r} ${y1}`,
    `L ${arc(x0 + r, y1 - r, 0, r, -r, 0)}`,
    `L ${x0} ${y0 + r}`,
    `L ${arc(x0 + r, y0 + r, -r, 0, 0, -r)}`,
    "Z",
  ].join(" ");
}

/** Coverage mask of the macOS tile body on a `size` canvas. */
async function macTileMask(size) {
  const ss = 2;
  const side = size * macBody(size);
  const path = squirclePath(size * ss, side * ss, side * MAC_CORNER * ss, MAC_CORNER_N);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size * ss}" height="${size * ss}"><path d="${path}" fill="#fff"/></svg>`;
  return toMask(
    sharp(Buffer.from(svg)).resize(size, size, { kernel: "lanczos3" }).extractChannel("alpha"),
    size,
    size,
  );
}

// ---------------------------------------------------------------------------
// Icon composition
// ---------------------------------------------------------------------------

async function composeIcon({ size, navy, mark, fit, mac }) {
  const canvas = rgba(size, size);

  if (mac) {
    const tile = await macTileMask(size);
    if (size >= MAC_SHADOW_MIN_SIZE) {
      // Drawn from the tile mask itself so it follows the squircle exactly
      // rather than approximating it with a rectangle.
      const shadow = await blurMask(tile, MAC_SHADOW_SIGMA * (size / 1024));
      over(
        canvas,
        tint(shadow, [0, 0, 0], MAC_SHADOW_OPACITY),
        0,
        Math.max(1, Math.round(MAC_SHADOW_OFFSET * (size / 1024))),
      );
    }
    over(canvas, tint(tile, navy), 0, 0);
  } else {
    // Windows draws app icons as they are, so a mac-style tile with transparent
    // padding renders small and floaty in the taskbar. Full-bleed instead, with
    // the mark taking up more of the canvas.
    for (let i = 0; i < size * size; i++) {
      canvas.data[i * 4] = navy[0];
      canvas.data[i * 4 + 1] = navy[1];
      canvas.data[i * 4 + 2] = navy[2];
      canvas.data[i * 4 + 3] = 255;
    }
  }

  await placeMark(canvas, mark, fit(size));
  return canvas;
}

// .icns carries independent artwork per size, which is how Apple's own icons
// ship less detail at 16px than at 512px. electron-builder would generate the
// .icns from a single 1024px PNG and put the same over-detailed art in every
// slot, so the set is built here and mac.icon points at the result.
const ICNS_SLOTS = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

async function appIcon(target, { mark, simpleMark, macFit, winFit }, navy) {
  const out = join(build, target);
  ensure(out);
  ensure(join(out, "tray"));
  const iconset = join(tmp, `${target}.iconset`);
  ensure(iconset);

  // Every slot is composed at its final size rather than downscaled from 1024,
  // so the squircle, the shadow and the mark all stay crisp; a 16px icon
  // resampled from a 1024px one loses its edge to the filter.
  for (const [name, size] of ICNS_SLOTS) {
    const icon = await composeIcon({
      size,
      navy,
      mark: isSmall(size) ? simpleMark : mark,
      fit: macFit,
      mac: true,
    });
    await asSharp(icon).png().toFile(join(iconset, name));
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", join(out, "icon.icns")], {
    stdio: "ignore",
  });

  // Kept beside the .icns as the reviewable master, and as the PNG fallback for
  // anything in electron-builder that wants one.
  await asSharp(await composeIcon({ size: 1024, navy, mark, fit: macFit, mac: true }))
    .png()
    .toFile(join(out, "icon.png"));

  await asSharp(await composeIcon({ size: 1024, navy, mark, fit: winFit, mac: false }))
    .png()
    .toFile(join(out, "icon-win.png"));

  // The 32px Windows tray icon is far below where the hairline grid survives,
  // and it used to be a straight resize of the source art, which on suite also
  // dragged in that drawing's white canvas.
  await asSharp(await composeIcon({ size: 128, navy, mark: simpleMark, fit: winFit, mac: false }))
    .resize(32, 32, { kernel: "lanczos3" })
    .png()
    .toFile(join(out, "tray", "tray-win.png"));
}

async function trayTemplates(target, trayFile) {
  const out = join(build, target, "tray");
  ensure(out);

  // macOS: flat black on transparent. The Template suffix is required — it tells
  // macOS to invert the image for light and dark menu bars.
  await sharp(join(src, trayFile)).resize(22, 22).png().toFile(join(out, "trayTemplate.png"));
  await sharp(join(src, trayFile)).resize(44, 44).png().toFile(join(out, "trayTemplate@2x.png"));
}

async function installerSidebar() {
  ensure(tmp);
  const png = join(tmp, "installerSidebar.png");

  // NSIS demands exactly 164x314. Cover-and-crop rather than squash, since the
  // source aspect ratio does not match.
  await sharp(join(src, "installer-sidebar.png"))
    .resize(164, 314, { fit: "cover", position: "centre" })
    .flatten({ background: "#1a1d21" })
    .png()
    .toFile(png);

  // sharp cannot write BMP; sips can, and ships with macOS.
  execFileSync("sips", ["-s", "format", "bmp", png, "--out", join(build, "installerSidebar.bmp")], {
    stdio: "ignore",
  });
}

async function dmgBackground() {
  await sharp(join(src, "dmg-background.png"))
    .resize(540, 380, { fit: "cover", position: "centre" })
    .png()
    .toFile(join(build, "dmg-background.png"));

  await sharp(join(src, "dmg-background.png"))
    .resize(1080, 760, { fit: "cover", position: "centre" })
    .png()
    .toFile(join(build, "dmg-background@2x.png"));
}

async function wordmarks() {
  // Light-text wordmark is the default; the dark-text original is invisible on
  // the dark chrome used everywhere here.
  await sharp(join(src, "wordmark-light.png")).png().toFile(join(build, "wordmark-light.png"));
  await sharp(join(src, "wordmark-dark.png")).png().toFile(join(build, "wordmark-dark.png"));
}

// ---------------------------------------------------------------------------

ensure(tmp);

// How much of the tile body each mark fills. The B is set by its height and the
// bubble by its width, because the two shapes carry their weight differently;
// these are the values that make the pair read as one family.
//
// The small sizes get a deliberately larger mark. Padding plus a 60% mark on a
// 14px tile leaves an 8px letterform, which is a smudge; Apple's own small art
// is likewise cropped in tighter than its large art.
const SUITE_MARK_HEIGHT = 0.6;
const SUITE_MARK_HEIGHT_SMALL = 0.74;
const TEAMS_MARK_WIDTH = 0.63;
const TEAMS_MARK_WIDTH_SMALL = 0.84;

// B width as a fraction of the bubble's width. Gold on gold would vanish, so it
// is knocked out in navy. Bigger at the small sizes for the same reason as above.
const BUBBLE_B_WIDTH = 0.55;
const BUBBLE_B_WIDTH_SMALL = 0.64;

const navy = await sampleNavy(join(src, "suite-icon.png"), SUITE_REGION);

const bMark = await extractMark(
  join(src, "suite-icon.png"),
  { region: SUITE_REGION, plateBox: SUITE_REGION },
  navy,
);
const bubble = await extractMark(
  join(src, "teams-icon.png"),
  { region: TEAMS_REGION, plateBox: TEAMS_PLATE_BOX },
  navy,
);

console.log(`brand navy ${hex(navy)} (suite plate ${hex(bMark.plate)}, teams plate ${hex(bubble.plate)})`);
console.log(`B mark ${bMark.box.w}x${bMark.box.h}, bubble ${bubble.box.w}x${bubble.box.h}`);

// Both apps wear the same navy squircle so they read as sibling products; only
// the mark on it differs.
const bAspect = bMark.box.w / bMark.box.h;
await appIcon(
  "suite",
  {
    mark: bMark,
    simpleMark: simplify(bMark),
    macFit: (size) => ({
      width:
        size *
        macBody(size) *
        (isSmall(size) ? SUITE_MARK_HEIGHT_SMALL : SUITE_MARK_HEIGHT) *
        bAspect,
      cx: size / 2,
      cy: size / 2,
      optical: true,
    }),
    winFit: (size) => ({
      width: size * 0.72 * bAspect,
      cx: size / 2,
      cy: size / 2,
      optical: true,
    }),
  },
  navy,
);

const teamsMark = await bubbleWithB(bubble, bMark, navy, BUBBLE_B_WIDTH);
const teamsSimple = await bubbleWithB(
  simplify(bubble),
  simplify(bMark),
  navy,
  BUBBLE_B_WIDTH_SMALL,
);
console.log(`bubble body bottom at y=${teamsMark.bodyBottom} of ${bubble.box.y + bubble.box.h - 1}`);

await appIcon(
  "teams",
  {
    mark: teamsMark,
    simpleMark: teamsSimple,
    macFit: (size) => ({
      width: size * macBody(size) * (isSmall(size) ? TEAMS_MARK_WIDTH_SMALL : TEAMS_MARK_WIDTH),
      cx: size / 2,
      cy: size / 2,
    }),
    winFit: (size) => ({ width: size * 0.78, cx: size / 2, cy: size / 2 }),
  },
  navy,
);

await trayTemplates("suite", "suite-tray.png");
await trayTemplates("teams", "teams-tray.png");
await installerSidebar();
await dmgBackground();
await wordmarks();

rmSync(tmp, { recursive: true, force: true });
console.log("assets prepared");
