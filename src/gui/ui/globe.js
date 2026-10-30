// The globe on the desk: a year of reading wound like a ball of yarn. A spiral of 365 days runs from
// a year ago at the bottom pole to today at the top; days with reading glow in the accent, more
// minutes brighter, and days read in a row are joined by a bright thread. The rest of the ball is
// faint glyphs. It turns slowly, follows a drag with inertia and wakes the glyphs under the cursor.
// Point at a day to see it; click a day to select the book read most that day, double-click to
// open it; a click elsewhere sends a wave around.

import { calm } from "./core.js";

/** @typedef {{ time: number, minutes: number, book: {id: number, title: string} | null }} Day */

const GLYPHS = ["·", "∙", ":", "+", "*"];
const BODY = 520;
const DAYS = 365;
/** Distance of the eye, in sphere radii: lower is a stronger perspective. */
const EYE = 3.4;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** @type {HTMLCanvasElement | null} */
let canvas = null;
/** @type {CanvasRenderingContext2D | null} */
let ctx = null;
let w = 0, h = 0;
let hooks = {
  pick: (/** @type {number} */ _id) => {},
  open: (/** @type {number} */ _id) => {},
  label: (/** @type {Day} */ _day) => "",
};

/** The body of the ball: faint points spread evenly (a Fibonacci lattice). */
const body = Array.from({ length: BODY }, (_, i) => {
  const y = 1 - (i / (BODY - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  return { x: Math.cos(GOLDEN * i) * r, y, z: Math.sin(GOLDEN * i) * r, j: Math.random() };
});
/** The year: a spiral from the bottom pole to the top with even steps (Saff and Kuijlaars). */
const spiral = (() => {
  let phi = 0;
  return Array.from({ length: DAYS }, (_, k) => {
    const y = -1 + (2 * k) / (DAYS - 1);
    const r = Math.sqrt(1 - y * y);
    if (k > 0 && k < DAYS - 1) phi = (phi + 3.6 / Math.sqrt(DAYS) / r) % (2 * Math.PI);
    return { x: Math.cos(phi) * r * 1.02, y: y * 1.02, z: Math.sin(phi) * r * 1.02 };
  });
})();
/** @type {Day[]} */
let days = [];
let most = 1;
/** The day at spiral position `k`; the newest day is always at the top pole. */
const dayAt = (/** @type {number} */ k) => days[k - (DAYS - days.length)];

let yaw = 0.6, pitch = 0.5, spin = 0, tilt = 0;
let born = 0;
let frame = 0;
let visible = false;
const pointer = { x: 0, y: 0, on: false, down: false, moved: 0, lastX: 0, lastY: 0 };
/** @type {{o: {x: number, y: number, z: number}, t: number}[]} */
let waves = [];
/** Index of the day under the cursor. @type {number | null} */
let hover = null;

export function mount(/** @type {HTMLCanvasElement} */ el, /** @type {typeof hooks} */ on) {
  canvas = el;
  ctx = el.getContext("2d");
  hooks = on;
  born = performance.now() / 1000;
  new ResizeObserver(resize).observe(el);
  new IntersectionObserver(([e]) => {
    visible = !!e?.isIntersecting;
    wake();
  }).observe(el);
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.on = true;
    if (pointer.down) {
      const dx = e.clientX - pointer.lastX, dy = e.clientY - pointer.lastY;
      pointer.moved += Math.abs(dx) + Math.abs(dy);
      spin = dx * 0.006;
      tilt = dy * 0.005;
      yaw += spin;
      pitch = Math.max(-1.2, Math.min(1.2, pitch + tilt));
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
    }
    wake();
  });
  el.addEventListener("pointerleave", () => ((pointer.on = false), (hover = null), wake()));
  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    pointer.down = true;
    pointer.moved = 0;
    pointer.lastX = e.clientX;
    pointer.lastY = e.clientY;
  });
  el.addEventListener("pointerup", () => {
    pointer.down = false;
    if (pointer.moved > 4) return;
    const book = hover !== null ? dayAt(hover)?.book : null;
    if (book) return hooks.pick(book.id);
    const at = nearest();
    if (at && !calm()) waves.push({ o: at, t: performance.now() / 1000 });
    wake();
  });
  el.addEventListener("dblclick", () => {
    const book = hover !== null ? dayAt(hover)?.book : null;
    if (book) hooks.open(book.id);
  });
}

/** The last 365 days, oldest first. */
export function setDays(/** @type {Day[]} */ list) {
  days = list.slice(-DAYS);
  most = Math.max(1, ...days.map((d) => d.minutes));
  wake();
}

function resize() {
  if (!canvas || !ctx) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  w = canvas.clientWidth;
  h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  wake();
}

/** Starts the loop if anything should move; with reduced motion only drags and changes redraw. */
function wake() {
  if (!frame && visible && w) frame = requestAnimationFrame(tick);
}

let last = 0;
let drawnAt = 0;
function tick(/** @type {number} */ ms) {
  frame = 0;
  // Thirty frames a second are plenty for a slow globe; a drag gets every frame.
  if (!pointer.down && ms - drawnAt < 30) return void (frame = requestAnimationFrame(tick));
  drawnAt = ms;
  const t = ms / 1000;
  const dt = Math.min(0.05, last ? t - last : 0.016);
  last = t;
  const still = calm();
  if (!pointer.down) {
    // A flick keeps turning and slows down; then the slow turn of its own takes over.
    spin *= 0.94;
    tilt *= 0.9;
    yaw += spin + (still ? 0 : dt * 0.12);
    pitch = Math.max(-1.2, Math.min(1.2, pitch + tilt));
  }
  draw(t, still);
  const moving = !still || pointer.down || Math.abs(spin) > 1e-4 || waves.length;
  if (moving && visible && !document.hidden) frame = requestAnimationFrame(tick);
  else last = 0;
}

/** Rotates and projects a sphere point to the canvas. */
function project(/** @type {{x: number, y: number, z: number}} */ p, /** @type {number} */ radius) {
  const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  const x1 = p.x * cy + p.z * sy;
  const z1 = -p.x * sy + p.z * cy;
  const y2 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  const s = EYE / (EYE - z2);
  return { x: w / 2 + x1 * radius * s, y: h / 2 - y2 * radius * s, z: z2, s };
}

/** The sphere point under the cursor, for the wave to start from. */
function nearest() {
  const radius = Math.min(w, h) * 0.38;
  let best = null, bestD = 400;
  for (const p of body) {
    const q = project(p, radius);
    const d = (q.x - pointer.x) ** 2 + (q.y - pointer.y) ** 2;
    if (q.z > 0 && d < bestD) (best = p), (bestD = d);
  }
  return best;
}

/** Brightening from the cursor and the waves at a point. */
function stir(/** @type {{x: number, y: number, z: number}} */ p, /** @type {{x: number, y: number, z: number}} */ q, /** @type {number} */ t) {
  let k = 0;
  if (pointer.on && q.z > -0.2) {
    const d = Math.hypot(q.x - pointer.x, q.y - pointer.y);
    if (d < 60) k += 1 - d / 60;
  }
  for (const v of waves) {
    const age = t - v.t;
    const a = Math.acos(Math.max(-1, Math.min(1, (p.x * v.o.x + p.y * v.o.y + p.z * v.o.z) / 1.02))) - age * 2.2;
    k += Math.exp(-(a * a) / 0.05) * Math.exp(-age * 1.3);
  }
  return k;
}

function draw(/** @type {number} */ t, /** @type {boolean} */ still) {
  if (!ctx || !canvas) return;
  const style = getComputedStyle(canvas);
  const ink = style.getPropertyValue("--ink").trim() || "#888";
  const accent = style.getPropertyValue("--accent").trim() || "#a68cff";
  const surface = style.getPropertyValue("--surface").trim() || "#fff";
  ctx.clearRect(0, 0, w, h);
  const radius = Math.min(w, h) * 0.38;
  // The ball winds itself up from a loose cloud when the window opens.
  const grow = still ? 1 : Math.min(1, (t - born) / 1.6);
  const ease = 1 - Math.pow(1 - grow, 3);
  waves = waves.filter((v) => t - v.t < 2.4);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let font = "";
  const glyph = (/** @type {string} */ c, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ size) => {
    // Whole pixel sizes, so the font is set a few times a frame rather than for every glyph.
    const next = `${Math.round(size)}px ui-monospace, "JetBrains Mono", monospace`;
    if (next !== font) ctx.font = font = next;
    ctx.fillText(c, x, y);
  };

  const spread = (/** @type {{x: number, y: number, z: number}} */ p, /** @type {number} */ j) => {
    const f = 1 + (1 - ease) * (0.6 + j);
    return { x: p.x * f, y: p.y * f, z: p.z * f };
  };
  const drawn = body.map((p) => ({ p, q: project(spread(p, p.j), radius) })).sort((a, b) => a.q.z - b.q.z);
  ctx.fillStyle = ink;
  for (const { p, q } of drawn) {
    const k = stir(p, q, t);
    const depth = (q.z + 1) / 2;
    ctx.globalAlpha = Math.min(1, (q.z < -0.1 ? 0.04 : 0.06 + depth * 0.2) + k * 0.45) * ease;
    glyph(GLYPHS[Math.min(GLYPHS.length - 1, Math.floor(depth * 1.6 + p.j * 0.8) + Math.round(k * 2))], q.x, q.y, 7 + 3 * q.s);
  }

  // The year's thread: faint all along, bright where days were read in a row.
  const placed = spiral.map((p) => project(spread(p, 0.5), radius));
  for (let k = 1; k < DAYS; k++) {
    const a = placed[k - 1], b = placed[k];
    if (a.z <= 0 || b.z <= 0) continue;
    const read = (dayAt(k - 1)?.minutes ?? 0) > 0 && (dayAt(k)?.minutes ?? 0) > 0;
    ctx.globalAlpha = (read ? 0.75 : 0.1) * Math.min(1, Math.min(a.z, b.z) * 3) * ease;
    ctx.strokeStyle = read ? accent : ink;
    ctx.lineWidth = read ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // The days: glyphs that grow with the minutes read, in the accent when there was reading.
  hover = null;
  let best = 81;
  const order = placed.map((q, k) => k).sort((a, b) => placed[a].z - placed[b].z);
  for (const k of order) {
    const q = placed[k];
    const day = dayAt(k);
    const share = day ? day.minutes / most : 0;
    const front = q.z > -0.05;
    const k2 = stir(spiral[k], q, t);
    if (front && pointer.on && !pointer.down && day) {
      const d = (q.x - pointer.x) ** 2 + (q.y - pointer.y) ** 2;
      if (d < best) (best = d), (hover = k);
    }
    if (share > 0) {
      ctx.fillStyle = accent;
      ctx.globalAlpha = (front ? 0.55 + 0.45 * share : 0.12) * ease;
      glyph(GLYPHS[Math.min(GLYPHS.length - 1, 2 + Math.round(share * 2))], q.x, q.y, (9 + 7 * Math.sqrt(share)) * q.s);
    } else {
      ctx.fillStyle = ink;
      ctx.globalAlpha = Math.min(1, (front ? 0.22 : 0.05) + k2 * 0.4) * ease;
      glyph(GLYPHS[Math.min(GLYPHS.length - 1, 1 + Math.round(k2 * 2))], q.x, q.y, 8 * q.s);
    }
  }

  // Today: a beating ring at the top of the ball.
  const today = placed[DAYS - 1];
  if (today.z > -0.2) {
    const beat = still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.4);
    ctx.globalAlpha = ease;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(today.x, today.y, 4 + beat * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (hover !== null) {
    const q = placed[hover];
    ctx.globalAlpha = 1;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    let text = hooks.label(dayAt(hover));
    if (text.length > 48) text = `${text.slice(0, 47)}…`;
    ctx.font = font = `500 12px ${style.getPropertyValue("--font-ui") || "sans-serif"}`;
    const tw = ctx.measureText(text).width;
    const x = Math.max(tw / 2 + 10, Math.min(w - tw / 2 - 10, q.x));
    const y = q.y < 30 ? q.y + 22 : q.y - 20;
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = surface;
    ctx.beginPath();
    ctx.roundRect(x - tw / 2 - 9, y - 12, tw + 18, 24, 12);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.fillText(text, x, y + 0.5);
  }
  canvas.style.cursor = pointer.down ? "grabbing" : hover !== null && dayAt(hover)?.book ? "pointer" : "grab";
  ctx.globalAlpha = 1;
}
