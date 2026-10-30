// The desk field of each atmosphere: a grid of marks over the whole desk whose levels come from a
// slow pattern of the look. The cursor parts it like a finger in water and touches it in the look's
// way (a ring of light, a lamp, a shadow, a wiped trail); a click beside the sheet sends a ring.
// Drawn on a canvas: glyphs (Terminal), dots or dashes, copied from an atlas of the ten levels. A
// frame redraws only the cells whose level changed, about one in ten: every canvas call costs, so
// drawing all of them took a third of a CPU core in WebKitGTK.
//
// Looks: grid (Terminal) ASCII ripples, lamp (Study) a halftone pool of lamplight, blinds (Noir)
// hatching where light falls through blinds, fog (Rain) condensation the cursor wipes off the glass,
// clouds (Storm) sheets of rain blown across, ridges (Mountain) twinkling stars, gradient (Soft)
// slow pearl rings.

import { calm, state } from "./core.js";

const RAMP = " .:-=+*#%@";
const LEVELS = RAMP.length - 1;
/** 4×4 ordered dither: a level between two marks picks one by cell, so gradients stay smooth. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Reach of the cursor, in pixels. */
const REACH = 110;
/** A fixed pseudo-random number in [0, 1) for a cell. */
const hash = (/** @type {number} */ c, /** @type {number} */ r) => {
  const s = Math.sin(c * 127.1 + r * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * @typedef {{
 *   mark: "glyph" | "dot" | "dash", cell: [number, number], alpha: number, color: string,
 *   touch: "ring" | "disc" | "shadow" | "wipe", awake?: number, size?: number, angle?: number,
 *   jitter?: boolean, grain?: boolean, pattern: (t: number, w: number, h: number) => (x: number, y: number, c: number, r: number) => number
 * }} Style
 */

/** @type {Record<string, Style>} */
const STYLES = {
  grid: {
    mark: "glyph", cell: [10.2, 20], alpha: 0.38, color: "--accent", touch: "ring",
    // One source rises from below the left, the other falls from above the right; both wander.
    pattern(t, w, h) {
      const ax = w * (0.22 + 0.08 * Math.sin(t * 0.05)), ay = h * 1.08;
      const bx = w * (0.8 + 0.06 * Math.cos(t * 0.04)), by = -h * 0.12;
      return (x, y) => {
        const a = Math.sin(Math.hypot(x - ax, y - ay) * 0.032 - t * 1.1);
        const b = Math.sin(Math.hypot(x - bx, y - by) * 0.021 + t * 0.7);
        return (0.5 + 0.5 * (a * 0.6 + b * 0.4)) ** 3;
      };
    },
  },
  lamp: {
    mark: "dot", cell: [15, 15], size: 0.42, alpha: 0.32, color: "--accent", touch: "disc",
    // The pool under the lamp at the top left breathes; the cursor is a second, smaller lamp.
    pattern(t, w, h) {
      const lx = w * 0.12, rx = w * 0.55, ry = h * 0.7;
      return (x, y) => {
        const pool = Math.exp(-(((x - lx) / rx) ** 2) - ((y / ry) ** 2));
        return pool * (0.8 + 0.2 * Math.sin(Math.hypot(x - lx, y) * 0.03 - t * 0.9));
      };
    },
  },
  blinds: {
    mark: "dash", cell: [12, 12], angle: -28, alpha: 0.4, color: "--ink", touch: "shadow",
    // Slats of light at the blinds' angle, brightest where the light falls; it brightens and dims
    // as if clouds passed the sun. The cursor is a silhouette before the window.
    pattern(t, w, h) {
      const cos = Math.cos(-28 * Math.PI / 180), sin = Math.sin(-28 * Math.PI / 180);
      const sun = 0.75 + 0.25 * Math.sin(t * 0.35);
      return (x, y) => {
        const mask = Math.max(0, 1 - Math.hypot((x / w - 0.75) / 0.8, (y / h - 0.3) / 0.7));
        const slat = Math.max(0, Math.sin((y * cos - x * sin) * 0.143 + t * 0.15));
        return mask * Math.sqrt(slat) * sun;
      };
    },
  },
  fog: {
    mark: "dot", cell: [16, 16], size: 0.22, jitter: true, grain: true, alpha: 0.15, color: "--ink", touch: "wipe", awake: 6000,
    // Condensation of uneven drops; it fogs back over a wiped trail in a few seconds.
    pattern(t) {
      return (x, y, c, r) => (0.45 + 0.4 * hash(c, r)) * (0.85 + 0.15 * Math.sin(x * 0.01 + y * 0.013 + t * 0.3));
    },
  },
  clouds: {
    mark: "dash", cell: [13, 16], angle: -78, alpha: 0.42, color: "--ink", touch: "ring",
    // Sheets of rain swept across by gusts, heavier under the clouds.
    pattern(t, w, h) {
      return (x, y) => {
        const sheet = 0.5 + 0.5 * Math.sin(x * 0.009 + y * 0.003 - t * 1.3);
        const gust = 0.5 + 0.5 * Math.sin(y * 0.011 - x * 0.002 + t * 0.5);
        return sheet * sheet * gust * (0.45 + 0.55 * (1 - y / h));
      };
    },
  },
  ridges: {
    mark: "dot", cell: [24, 24], size: 0.13, jitter: true, grain: true, alpha: 0.9, color: "#ffffff", touch: "disc",
    // Stars over the mountains: a few bright, most faint, each twinkling at its own pace; the
    // cursor brings out the faint ones.
    pattern(t, w, h) {
      return (x, y, c, r) => {
        const k = hash(c, r);
        const sky = Math.max(0, 1 - y / (h * 0.62));
        return sky * k ** 4 * (0.65 + 0.35 * Math.sin(t * (0.6 + k * 2) + k * 40));
      };
    },
  },
  gradient: {
    mark: "dot", cell: [24, 24], size: 0.22, alpha: 0.16, color: "--accent", touch: "disc",
    // Pearls in slow rings that spread from the corner of the light.
    pattern(t, w, h) {
      return (x, y) => {
        const d = Math.hypot(x - w * 0.85, y - h * 0.15);
        return 0.5 + 0.5 * Math.sin(d * 0.012 - t * 0.45);
      };
    },
  },
};

/** @type {HTMLCanvasElement | null} */
let el = null;
/** @type {Style | null} */
let style = null;
let ink = "#fff";
let font = "";
let frame = 0;
let last = 0;
let cols = 0, rows = 0, dpr = 1;
/** The fog left on each cell, for the wiped glass. @type {Float32Array} */
let fog = new Float32Array(0);
/** The cursor in field pixels, eased; `on` fades in and out as it comes and goes. */
const cursor = { x: 0, y: 0, tx: 0, ty: 0, on: 0, inside: false };
/** @type {{x: number, y: number, t: number}[]} */
let rings = [];
/** When the pointer last moved. The field moves only for a while after that, and stands still
 * while the reader reads, so a resting reader costs no CPU. */
let stirred = 0;
/** The field's own clock, which stops while it stands still so it resumes where it froze. */
let clock = 0;

/** Shows the field of a background kind, or hides it with null; the loop runs only while shown. */
export function toggle(/** @type {string | null} */ kind) {
  el ??= /** @type {HTMLCanvasElement} */ (document.getElementById("band"));
  if (!el) return;
  style = (kind && STYLES[kind]) || null;
  el.hidden = !style;
  cancelAnimationFrame(frame);
  frame = 0;
  rings = [];
  if (!style) return void (el.width = el.height = 0);
  measure();
  draw(clock);
  wake();
}

function wake() {
  stirred = performance.now();
  if (!frame && style && !calm()) (last = 0), (frame = requestAnimationFrame(tick));
}

function measure() {
  if (!el || !style) return;
  const css = getComputedStyle(el);
  ink = style.color.startsWith("--") ? css.getPropertyValue(style.color).trim() || "#fff" : style.color;
  font = `600 17px ${css.getPropertyValue("--font-mono").trim() || "monospace"}`;
  dpr = Math.min(devicePixelRatio || 1, 1.5);
  el.width = Math.round(el.clientWidth * dpr);
  el.height = Math.round(el.clientHeight * dpr);
  cols = Math.ceil(el.clientWidth / style.cell[0]) + 1;
  rows = Math.ceil(el.clientHeight / style.cell[1]);
  if (fog.length !== cols * rows) fog = new Float32Array(cols * rows).fill(1);
  drawAtlas();
  // Canvas text falls back to another font until the face is loaded.
  if (style.mark === "glyph") document.fonts.load(font).then(() => (drawAtlas(), draw(clock)), () => {});
}

/** The pointer in window coordinates, or null when it leaves the reader. */
export function setPointer(/** @type {number | null} */ x, y = 0) {
  if (!el || !style) return;
  if (x === null) return void (cursor.inside = false);
  const r = el.getBoundingClientRect();
  cursor.tx = x - r.left;
  cursor.ty = y - r.top;
  cursor.inside = true;
  if (cursor.on === 0) (cursor.x = cursor.tx), (cursor.y = cursor.ty);
  wake();
}

export function ring(/** @type {number} */ x, /** @type {number} */ y) {
  if (!el || !style || calm()) return;
  const r = el.getBoundingClientRect();
  rings.push({ x: x - r.left, y: y - r.top, t: clock });
  wake();
}

function tick(/** @type {number} */ ms) {
  if (!style || document.hidden || (ms - stirred > (style.awake ?? 2000) && !rings.length)) return void (frame = 0);
  frame = requestAnimationFrame(tick);
  if (ms - last < 50) return;
  const dt = last ? Math.min(0.1, (ms - last) / 1000) : 0;
  clock += dt;
  last = ms;
  cursor.on += ((cursor.inside ? 1 : 0) - cursor.on) * 0.15;
  cursor.x += (cursor.tx - cursor.x) * 0.3;
  cursor.y += (cursor.ty - cursor.y) * 0.3;
  if (style.touch === "wipe") regrow(dt);
  draw(clock);
}

/** The glass fogs back over; the cursor wipes it clear where it passes. */
function regrow(/** @type {number} */ dt) {
  const [cw, ch] = /** @type {Style} */ (style).cell;
  for (let i = 0; i < fog.length; i++) fog[i] += (1 - fog[i]) * dt * 0.45;
  if (cursor.on < 0.5) return;
  const reach = 46;
  const c0 = Math.max(0, Math.floor((cursor.x - reach) / cw)), c1 = Math.min(cols - 1, Math.ceil((cursor.x + reach) / cw));
  const r0 = Math.max(0, Math.floor((cursor.y - reach) / ch)), r1 = Math.min(rows - 1, Math.ceil((cursor.y + reach) / ch));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const d = Math.hypot((c + 0.5) * cw - cursor.x, (r + 0.5) * ch - cursor.y) / reach;
      if (d < 1) fog[r * cols + c] = Math.min(fog[r * cols + c], d * d);
    }
  }
}

function draw(/** @type {number} */ t) {
  if (!el || !style) return;
  if (el.width !== Math.round(el.clientWidth * dpr) || el.height !== Math.round(el.clientHeight * dpr)) measure();
  rings = rings.filter((r) => t - r.t < 2.2);
  const [cw, ch] = style.cell;
  const w = cols * cw, h = rows * ch;
  const at = style.pattern(t, w, h);
  const touch = style.touch;
  const parts = touch !== "wipe";
  /** Cell levels from 0 to LEVELS. */
  const level = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const py = (r + 0.5) * ch;
    for (let c = 0; c < cols; c++) {
      let px = (c + 0.5) * cw;
      let sy = py;
      let lift = 0;
      let shade = 1;
      if (cursor.on > 0.01) {
        const dx = px - cursor.x, dy = py - cursor.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < REACH * 2.2) {
          const k = d / REACH;
          if (parts) {
            // The water parts: cells sample the field from nearer the cursor, so waves bow away.
            const push = 26 * cursor.on * Math.exp(-k * k);
            px -= (dx / d) * push;
            sy -= (dy / d) * push;
          }
          if (touch === "ring") lift += 0.3 * cursor.on * Math.exp(-((k - 0.75) ** 2) / 0.08);
          else if (touch === "disc") lift += 0.3 * cursor.on * Math.exp(-k * k * 1.6);
          else if (touch === "shadow") shade = 1 - 0.9 * cursor.on * Math.exp(-k * k * 1.4);
        }
      }
      for (const g of rings) {
        const d = Math.hypot(px - g.x, py - g.y);
        const age = t - g.t;
        lift += 0.8 * Math.exp(-(((d - age * 260) / 22) ** 2)) * Math.exp(-age * 1.6);
      }
      if (style.grain) lift *= hash(c, r);
      let v = at(px, sy, c, r) * (touch === "wipe" ? fog[r * cols + c] : shade) + lift;
      v = Math.min(1, Math.max(0, v)) * LEVELS;
      const i = Math.floor(v);
      level[r * cols + c] = Math.min(LEVELS, i + (v - i > (BAYER[(r % 4) * 4 + (c % 4)] + 0.5) / 16 ? 1 : 0));
    }
  }
  paint(level);
}

/** The mark of each level drawn once, side by side; a frame only copies them. Copying is several
 * times cheaper than filling paths or shaping text for thousands of cells. */
const atlas = document.createElement("canvas");
/** One mark's box in the atlas, in device pixels. */
let sw = 0, sh = 0;
/** How far a jittered dot may move from its cell's center and still stay inside the cell. */
let jx = 0, jy = 0;
/** The level each cell shows on the canvas now; 255 makes it redraw. */
let shown = new Uint8Array(0);

function drawAtlas() {
  const s = /** @type {Style} */ (style);
  const [cw, ch] = s.cell;
  sw = Math.ceil(cw * dpr);
  sh = Math.ceil(ch * dpr);
  atlas.width = sw * (LEVELS + 1);
  atlas.height = sh;
  const a = /** @type {CanvasRenderingContext2D} */ (atlas.getContext("2d"));
  a.setTransform(dpr, 0, 0, dpr, 0, 0);
  a.fillStyle = a.strokeStyle = ink;
  a.font = font;
  a.textBaseline = "middle";
  a.lineWidth = 1.2;
  a.lineCap = "round";
  const unit = Math.min(cw, ch);
  const ax = Math.cos(((s.angle ?? 0) * Math.PI) / 180), ay = Math.sin(((s.angle ?? 0) * Math.PI) / 180);
  const rmax = Math.max(0.6, unit * (s.size ?? 0.4)) + 1;
  jx = s.jitter ? Math.max(0, cw / 2 - rmax) : 0;
  jy = s.jitter ? Math.max(0, ch / 2 - rmax) : 0;
  shown = new Uint8Array(cols * rows).fill(255);
  /** @type {HTMLCanvasElement} */ (el).getContext("2d")?.clearRect(0, 0, /** @type {HTMLCanvasElement} */ (el).width, /** @type {HTMLCanvasElement} */ (el).height);
  for (let n = 1; n <= LEVELS; n++) {
    const left = (n * sw) / dpr, x = left + cw / 2, y = ch / 2;
    const size = (n / LEVELS) * unit;
    if (s.mark === "glyph") a.fillText(RAMP[n], left, y);
    else {
      a.beginPath();
      if (s.mark === "dot") a.arc(x, y, Math.max(0.6, size * (s.size ?? 0.4)), 0, Math.PI * 2);
      else a.moveTo(x - ax * size * 0.45, y - ay * size * 0.45), a.lineTo(x + ax * size * 0.45, y + ay * size * 0.45);
      if (s.mark === "dot") a.fill();
      else a.stroke();
    }
  }
}

/** Redraws the cells whose level changed: clears the cell and copies its mark from the atlas, at
 * whole device pixels so the copy is a plain blit. Marks stay inside their cells, so cells never
 * overlap. */
function paint(/** @type {Uint8Array} */ level) {
  const s = /** @type {Style} */ (style);
  const ctx = /** @type {CanvasRenderingContext2D} */ (/** @type {HTMLCanvasElement} */ (el).getContext("2d"));
  const [cw, ch] = s.cell;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = s.alpha * Math.min(state.config.reader.effects ?? 1, 1.5);
  for (let r = 0; r < rows; r++) {
    const y0 = Math.round(r * ch * dpr), y1 = Math.round((r + 1) * ch * dpr);
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c, n = level[i];
      if (n === shown[i]) continue;
      shown[i] = n;
      const x0 = Math.round(c * cw * dpr);
      ctx.clearRect(x0, y0, Math.round((c + 1) * cw * dpr) - x0, y1 - y0);
      if (!n) continue;
      const x = c * cw + (jx && (hash(r, c) * 2 - 1) * jx), y = r * ch + (jy && (hash(c + 7, r) * 2 - 1) * jy);
      ctx.drawImage(atlas, n * sw, 0, sw, sh, Math.round(x * dpr), Math.round(y * dpr), sw, sh);
    }
  }
}

addEventListener("resize", () => {
  if (!el || !style) return;
  measure();
  draw(clock);
});
