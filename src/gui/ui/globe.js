// The globe on the desk: the library as a sphere of glyphs. Books are the bright nodes, in their
// cloth colors, and threads join books that share a shelf or an author, with a spark running along
// them. It turns slowly, follows a drag with inertia and wakes the glyphs under the cursor. A
// click on a book selects it, a double click opens it, a click elsewhere sends a wave around.

import { calm } from "./core.js";

/** @typedef {import("./core.js").Book} Book */

const GLYPHS = ["·", "∙", ":", "+", "*"];
const POINTS = 900;
const MAX_BOOKS = 28;
/** Distance of the eye, in sphere radii: lower is a stronger perspective. */
const EYE = 3.2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** @type {HTMLCanvasElement | null} */
let canvas = null;
/** @type {CanvasRenderingContext2D | null} */
let ctx = null;
let w = 0, h = 0;
let hooks = { pick: (/** @type {number} */ _id) => {}, open: (/** @type {number} */ _id) => {} };

/** Unit points on the sphere, spread evenly (a Fibonacci lattice), each with its own jitter. */
const points = Array.from({ length: POINTS }, (_, i) => {
  const y = 1 - (i / (POINTS - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  return { x: Math.cos(GOLDEN * i) * r, y, z: Math.sin(GOLDEN * i) * r, j: Math.random() };
});
/** @type {{id: number, title: string, color: string, p: {x: number, y: number, z: number}}[]} */
let nodes = [];
/** Threads between books: points along the great circle, lifted a little off the surface. */
let arcs = /** @type {{x: number, y: number, z: number}[][]} */ ([]);

let yaw = 0.6, pitch = -0.25, spin = 0, tilt = 0;
let born = 0;
let frame = 0;
let visible = false;
const pointer = { x: 0, y: 0, on: false, down: false, moved: 0, lastX: 0, lastY: 0 };
/** @type {{o: {x: number, y: number, z: number}, t: number}[]} */
let waves = [];
/** @type {number | null} */
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
    el.classList.add("grabbing");
  });
  el.addEventListener("pointerup", () => {
    pointer.down = false;
    el.classList.remove("grabbing");
    if (pointer.moved > 4) return;
    if (hover !== null) return hooks.pick(hover);
    const at = nearest();
    if (at && !calm()) waves.push({ o: at, t: performance.now() / 1000 });
    wake();
  });
  el.addEventListener("dblclick", () => hover !== null && hooks.open(hover));
}

/** Puts the books on the globe: the most recent ones become nodes, joined by shelf and author. */
export function setBooks(/** @type {Book[]} */ books) {
  const list = [...books].sort((a, b) => (b.opened_at ?? 0) - (a.opened_at ?? 0) || b.added_at - a.added_at).slice(0, MAX_BOOKS);
  nodes = list.map((b, k) => ({ id: b.id, title: b.title, color: b.color, p: points[Math.floor(((k + 0.5) / list.length) * POINTS)] }));
  arcs = [];
  for (let a = 0; a < list.length && arcs.length < 40; a++) {
    for (let b = a + 1; b < list.length && arcs.length < 40; b++) {
      const kin = list[a].shelves.some((s) => list[b].shelves.includes(s)) || (list[a].authors[0] && list[a].authors[0] === list[b].authors[0]);
      if (kin) arcs.push(slerp(nodes[a].p, nodes[b].p));
    }
  }
  wake();
}

function slerp(/** @type {{x: number, y: number, z: number}} */ p, /** @type {{x: number, y: number, z: number}} */ q) {
  const angle = Math.acos(Math.max(-1, Math.min(1, p.x * q.x + p.y * q.y + p.z * q.z)));
  const s = Math.sin(angle) || 1e-6;
  return Array.from({ length: 25 }, (_, i) => {
    const f = i / 24;
    const a = Math.sin((1 - f) * angle) / s, b = Math.sin(f * angle) / s;
    const lift = 1 + 0.08 * Math.sin(Math.PI * f);
    return { x: (p.x * a + q.x * b) * lift, y: (p.y * a + q.y * b) * lift, z: (p.z * a + q.z * b) * lift };
  });
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
  const radius = Math.min(w, h) * 0.36;
  let best = null, bestD = 400;
  for (const p of points) {
    const q = project(p, radius);
    const d = (q.x - pointer.x) ** 2 + (q.y - pointer.y) ** 2;
    if (q.z > 0 && d < bestD) (best = p), (bestD = d);
  }
  return best;
}

function draw(/** @type {number} */ t, /** @type {boolean} */ still) {
  if (!ctx || !canvas) return;
  const style = getComputedStyle(canvas);
  const ink = style.getPropertyValue("--ink").trim() || "#888";
  const accent = style.getPropertyValue("--accent").trim() || "#a68cff";
  const surface = style.getPropertyValue("--surface").trim() || "#fff";
  ctx.clearRect(0, 0, w, h);
  const radius = Math.min(w, h) * 0.36;
  // The globe gathers from a loose cloud when the window opens.
  const grow = still ? 1 : Math.min(1, (t - born) / 1.6);
  const ease = 1 - Math.pow(1 - grow, 3);
  waves = waves.filter((v) => t - v.t < 2.4);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let font = "";
  const drawn = points.map((p) => {
    const spread = 1 + (1 - ease) * (0.6 + p.j);
    return { p, q: project({ x: p.x * spread, y: p.y * spread, z: p.z * spread }, radius) };
  });
  drawn.sort((a, b) => a.q.z - b.q.z);
  for (const { p, q } of drawn) {
    const depth = (q.z + 1) / 2;
    let alpha = q.z < -0.1 ? 0.06 : 0.1 + depth * 0.42;
    let level = Math.floor(depth * (GLYPHS.length - 1) * 0.85 + p.j * 0.9);
    let size = 8 + 4 * q.s;
    if (pointer.on && q.z > -0.2) {
      const d = Math.hypot(q.x - pointer.x, q.y - pointer.y);
      if (d < 70) {
        const k = 1 - d / 70;
        alpha += k * 0.5;
        level += Math.round(k * 2);
        size *= 1 + 0.25 * k;
      }
    }
    for (const v of waves) {
      const age = t - v.t;
      const a = Math.acos(Math.max(-1, Math.min(1, p.x * v.o.x + p.y * v.o.y + p.z * v.o.z))) - age * 2.2;
      const k = Math.exp(-(a * a) / 0.05) * Math.exp(-age * 1.3);
      alpha += k * 0.6;
      level += Math.round(k * 2);
    }
    ctx.globalAlpha = Math.min(1, alpha) * ease;
    ctx.fillStyle = ink;
    // Whole pixel sizes, so the font is set a few times a frame rather than for every glyph.
    const next = `${Math.round(size)}px ui-monospace, "JetBrains Mono", monospace`;
    if (next !== font) ctx.font = font = next;
    ctx.fillText(GLYPHS[Math.min(GLYPHS.length - 1, Math.max(0, level))], q.x, q.y);
  }

  // Threads, front halves only, with a spark running along each now and then.
  ctx.lineWidth = 1;
  ctx.strokeStyle = accent;
  arcs.forEach((arc, i) => {
    let prev = project(arc[0], radius);
    for (let k = 1; k < arc.length; k++) {
      const q = project(arc[k], radius);
      if (prev.z > 0 && q.z > 0) {
        ctx.globalAlpha = 0.22 * Math.min(1, Math.min(prev.z, q.z) * 3) * ease;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      prev = q;
    }
    if (still) return;
    const phase = (t * 0.22 + i * 0.37) % 1.6;
    if (phase > 1) return;
    const spark = project(arc[Math.floor(phase * (arc.length - 1))], radius);
    if (spark.z <= 0) return;
    ctx.globalAlpha = 0.9 * ease;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Books: a diamond in the cloth color with a thin ring, so dark cloth shows on a dark desk.
  hover = null;
  let label = null;
  const placed = nodes.map((n) => ({ n, q: project(n.p, radius) })).sort((a, b) => a.q.z - b.q.z);
  for (const { n, q } of placed) {
    const front = q.z > -0.05;
    const r = (front ? 4.2 : 2.6) * q.s;
    if (front && pointer.on && !pointer.down && Math.hypot(q.x - pointer.x, q.y - pointer.y) < 12) {
      hover = n.id;
      label = { n, q };
    }
    ctx.globalAlpha = (front ? 1 : 0.22) * ease;
    ctx.beginPath();
    ctx.moveTo(q.x, q.y - r);
    ctx.lineTo(q.x + r, q.y);
    ctx.lineTo(q.x, q.y + r);
    ctx.lineTo(q.x - r, q.y);
    ctx.closePath();
    ctx.fillStyle = n.color;
    ctx.fill();
    ctx.strokeStyle = hover === n.id ? accent : ink;
    ctx.globalAlpha = (hover === n.id ? 1 : front ? 0.45 : 0.1) * ease;
    ctx.lineWidth = hover === n.id ? 2 : 1;
    ctx.stroke();
  }
  canvas.style.cursor = pointer.down ? "grabbing" : hover !== null ? "pointer" : "grab";

  if (label) {
    const text = label.n.title.length > 42 ? `${label.n.title.slice(0, 41)}…` : label.n.title;
    ctx.font = `500 12px ${style.getPropertyValue("--font-ui") || "sans-serif"}`;
    const tw = ctx.measureText(text).width;
    const x = Math.max(tw / 2 + 12, Math.min(w - tw / 2 - 12, label.q.x));
    const y = label.q.y - 22;
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = surface;
    ctx.beginPath();
    ctx.roundRect(x - tw / 2 - 9, y - 12, tw + 18, 24, 12);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.fillText(text, x, y + 0.5);
  }
  ctx.globalAlpha = 1;
}
