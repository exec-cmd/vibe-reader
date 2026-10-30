// The band of the terminal look: a strip of ASCII at the top of the reader where slow waves run.
// The cursor parts the characters like a finger in water and lights a ring around itself; a click
// sends a ring outward. Drawn as text, so it takes the look's monospace font and accent.

import { calm } from "./core.js";

const RAMP = " .:-=+*#%@";
/** 4×4 ordered dither: a level between two characters picks one by cell, so gradients stay smooth. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Reach of the cursor, in pixels. */
const REACH = 70;

/** @type {HTMLElement | null} */
let el = null;
let frame = 0;
let last = 0;
let cols = 0, rows = 0, cw = 6.6, ch = 12;
/** The cursor in band pixels, eased; `on` fades in and out as it comes and goes. */
const cursor = { x: 0, y: 0, tx: 0, ty: 0, on: 0, inside: false };
/** @type {{x: number, y: number, t: number}[]} */
let rings = [];

/** Shows or hides the band; the loop runs only while it is shown. */
export function toggle(/** @type {boolean} */ on) {
  el ??= document.getElementById("band");
  if (!el) return;
  el.hidden = !on;
  cancelAnimationFrame(frame);
  frame = 0;
  if (!on) return void (el.textContent = "");
  measure();
  calm() ? draw(performance.now() / 1000) : (frame = requestAnimationFrame(tick));
}

function measure() {
  if (!el) return;
  const style = getComputedStyle(el);
  const size = parseFloat(style.fontSize) || 11;
  // Monospace fonts in the app advance 0.6 em per character.
  cw = size * 0.6;
  ch = parseFloat(style.lineHeight) || size * 1.1;
  cols = Math.ceil(el.clientWidth / cw) + 1;
  rows = Math.max(1, Math.floor(el.clientHeight / ch));
}

/** The pointer in window coordinates, or null when it leaves the reader. */
export function setPointer(/** @type {number | null} */ x, y = 0) {
  if (!el || el.hidden) return;
  if (x === null) return void (cursor.inside = false);
  const r = el.getBoundingClientRect();
  cursor.tx = x - r.left;
  cursor.ty = y - r.top;
  // Below the band the cursor still bends the bottom rows a little.
  cursor.inside = cursor.ty < r.height + REACH;
  if (cursor.on === 0) (cursor.x = cursor.tx), (cursor.y = cursor.ty);
}

export function ring(/** @type {number} */ x, /** @type {number} */ y) {
  if (!el || el.hidden || calm()) return;
  const r = el.getBoundingClientRect();
  rings.push({ x: x - r.left, y: y - r.top, t: performance.now() / 1000 });
}

function tick(/** @type {number} */ ms) {
  frame = requestAnimationFrame(tick);
  // Thirty frames a second while something moves, fewer when the band only breathes.
  const busy = cursor.on > 0.01 || rings.length;
  if (ms - last < (busy ? 33 : 90) || document.hidden) return;
  last = ms;
  cursor.on += ((cursor.inside ? 1 : 0) - cursor.on) * 0.15;
  cursor.x += (cursor.tx - cursor.x) * 0.3;
  cursor.y += (cursor.ty - cursor.y) * 0.3;
  draw(ms / 1000);
}

function draw(/** @type {number} */ t) {
  if (!el) return;
  if (el.clientWidth / cw + 1 > cols + 2 || el.clientWidth / cw + 1 < cols - 2) measure();
  rings = rings.filter((r) => t - r.t < 2.2);
  const top = RAMP.length - 1;
  let out = "";
  for (let r = 0; r < rows; r++) {
    // The band fades into the desk toward its bottom edge.
    const fade = 1 - Math.pow(r / Math.max(1, rows - 1), 1.4) * 0.75;
    const py = (r + 0.5) * ch;
    for (let c = 0; c < cols; c++) {
      let px = (c + 0.5) * cw;
      let sy = py;
      let lift = 0;
      if (cursor.on > 0.01) {
        const dx = px - cursor.x, dy = py - cursor.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < REACH * 2.2) {
          const k = d / REACH;
          // The water parts: cells sample the field from nearer the cursor, so waves bow away.
          const push = 18 * cursor.on * Math.exp(-k * k);
          px -= (dx / d) * push;
          sy -= (dy / d) * push;
          lift += 0.55 * cursor.on * Math.exp(-((k - 0.75) ** 2) / 0.08);
        }
      }
      for (const g of rings) {
        const d = Math.hypot(px - g.x, py - g.y);
        const age = t - g.t;
        lift += 0.8 * Math.exp(-(((d - age * 260) / 22) ** 2)) * Math.exp(-age * 1.6);
      }
      const x = px * 0.06, y = sy * 0.11;
      const a = Math.sin(x + t * 0.9 + Math.sin(y * 1.3 + t * 0.35) * 1.4);
      const b = Math.sin(x * 0.37 - t * 0.55 + y * 0.8);
      let v = Math.pow(0.5 + 0.5 * (a * 0.62 + b * 0.38), 2.4) * fade + lift;
      v = Math.min(1, Math.max(0, v)) * top;
      const i = Math.floor(v);
      out += RAMP[Math.min(top, i + (v - i > (BAYER[(r % 4) * 4 + (c % 4)] + 0.5) / 16 ? 1 : 0))];
    }
    out += "\n";
  }
  el.textContent = out;
}

addEventListener("resize", () => el && !el.hidden && measure());
