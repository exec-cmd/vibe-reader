// One canvas of particles behind the book, at most 30 frames per second. Particles live at
// different depths and meet the reader and the book: they drift with the cursor's parallax,
// part around it (rain breaks on it like on an umbrella), scatter from a click, catch the light
// near the cursor; snow settles on the sheet and the floor, rain splashes and runs down the glass,
// a page turn sends a gust, lightning draws a bolt.
// Stops when the window is hidden, in lite mode and when motion is reduced.

import { calm } from "./core.js";

/** @typedef {{x: number, y: number, vx: number, vy: number, bx: number, by: number, r: number, a: number, len: number, z: number}} P */
/** @typedef {{x: number, y: number, vx: number, vy: number, r: number, a: number, life: number, still: boolean}} Bit */

const canvas = () => /** @type {HTMLCanvasElement} */ (document.getElementById("fx"));
const FRAME = 1000 / 30;
/** Particles per million square pixels at density 1. */
const BASE = { dust: 70, rain: 260, downpour: 520, snow: 170, bokeh: 24 };
/** How much a gust moves each kind; heavy rain barely bends. */
const DRAG = { dust: 1, snow: 0.8, bokeh: 0.3, rain: 0.25, downpour: 0.15 };

let kind = "none";
let speed = 1;
let strength = 1;
let lightning = false;
/** @type {P[]} */
let parts = [];
/** Settled snow and rain splashes. @type {Bit[]} */
let bits = [];
/** Drops running down the glass. @type {{x: number, y: number, r: number, v: number, hold: number}[]} */
let drops = [];
/** Rings from clicks. @type {{x: number, y: number, r: number, life: number}[]} */
let rings = [];
/** The bolt of the last strike. @type {{points: number[][], life: number} | null} */
let bolt = null;
let raf = 0;
let last = 0;
let nextFlash = 0;
let gust = 0;
let color = "255,255,255";
/** Top edge of the sheet in canvas coordinates. @type {{x: number, y: number, w: number} | null} */
let edge = null;
/** The cursor in canvas coordinates; `sx`, `sy` follow it slowly for the parallax. */
const pointer = { x: 0, y: 0, px: 0, py: 0, sx: 0, sy: 0, on: false };
/** Called on each lightning strike. @type {() => void} */
let onStrike = () => {};

export const setOnStrike = (/** @type {() => void} */ fn) => (onStrike = fn);

/** Where the sheet is, so particles can land on it. */
export function setEdge(/** @type {DOMRect | null} */ rect) {
  const c = canvas();
  if (!rect || !c) return void (edge = null);
  const cr = c.getBoundingClientRect();
  edge = { x: rect.left - cr.left, y: rect.top - cr.top, w: rect.width };
}

/** The cursor in client coordinates, or null when it left or the reader went idle. */
export function setPointer(/** @type {number | null} */ x, /** @type {number} */ y = 0) {
  if (x === null) return void (pointer.on = false);
  const cr = canvas().getBoundingClientRect();
  if (!pointer.on) {
    pointer.px = x - cr.left;
    pointer.py = y - cr.top;
  }
  pointer.x = x - cr.left;
  pointer.y = y - cr.top;
  pointer.on = true;
}

/** A gust of air from a turning page: 1 blows right, -1 left. */
export function blow(/** @type {number} */ dir) {
  if (parts.length) gust = dir * 7;
}

/** A click on the desk: particles scatter from it and a ring spreads. */
export function burst(/** @type {number} */ x, /** @type {number} */ y) {
  if (!parts.length) return;
  const cr = canvas().getBoundingClientRect();
  x -= cr.left;
  y -= cr.top;
  rings.push({ x, y, r: 4, life: 1 });
  const reach = 260;
  for (const p of parts) {
    const dx = p.x - x, dy = p.y - y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > reach) continue;
    const f = (1 - d / reach) * 9 * (DRAG[kind] ?? 0.5) * (1.4 - p.z * 0.4);
    p.vx += (dx / d) * f;
    p.vy += (dy / d) * f;
  }
}

function spawn(w, h, anywhere) {
  const r = Math.random;
  const y = anywhere ? r() * h : -20;
  // Near particles are bigger, brighter and faster.
  const z = 0.35 + r() * 0.65;
  /** @type {Partial<P>} */
  let p;
  switch (kind) {
    case "dust": p = { x: r() * w, y: r() * h, vx: (r() - 0.5) * 0.15, vy: (r() - 0.5) * 0.1, r: 0.5 + z * 1.4, a: 0.1 + z * 0.35, len: 0 }; break;
    case "rain": p = { x: r() * w * 1.2, y, vx: -1.2, vy: 6 + z * 7, r: 0.5 + z * 0.8, a: 0.08 + z * 0.22, len: 6 + z * 14 }; break;
    case "downpour": p = { x: r() * w * 1.3, y, vx: -3, vy: 11 + z * 10, r: 0.6 + z, a: 0.1 + z * 0.28, len: 10 + z * 24 }; break;
    case "snow": p = { x: r() * w, y, vx: (r() - 0.5) * 0.6, vy: 0.3 + z * 1.3, r: 0.8 + z * 2.4, a: 0.25 + z * 0.5, len: 0 }; break;
    case "bokeh": p = { x: r() * w, y: r() * h, vx: (r() - 0.5) * 0.25, vy: -0.1 - r() * 0.2, r: 14 + z * 50, a: 0.03 + (1 - z) * 0.07, len: 0 }; break;
    default: return null;
  }
  return /** @type {P} */ ({ ...p, bx: p.vx, by: p.vy, z });
}

function resize() {
  const c = canvas();
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  c.width = c.clientWidth * dpr;
  c.height = c.clientHeight * dpr;
  c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Snow and rain that reach the top edge of the sheet (at x, from prevY to y) stay there for a while or splash. */
function land(/** @type {P} */ p, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ prevY) {
  if (!edge || y < edge.y || prevY >= edge.y || x < edge.x || x > edge.x + edge.w) return false;
  if (kind === "snow") settle(x, edge.y - p.r * 0.5, p);
  else if (kind === "rain" || kind === "downpour") splash(x, edge.y - 1, p.a);
  else return false;
  return true;
}

function settle(/** @type {number} */ x, /** @type {number} */ y, /** @type {P} */ p) {
  if (bits.length < 420) bits.push({ x, y, vx: 0, vy: 0, r: p.r, a: p.a, life: 1, still: true });
}

function splash(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ a) {
  const r = Math.random;
  for (let i = 0, n = 2 + Math.floor(r() * 2); i < n; i++) {
    bits.push({ x, y, vx: (r() - 0.5) * 3, vy: -1.5 - r() * 2, r: 0.9, a: a * 2, life: 0.35, still: false });
  }
}

/** A jagged path from the sky down to two thirds of the window, with a branch or two. */
function makeBolt(/** @type {number} */ w, /** @type {number} */ h) {
  const r = Math.random;
  const main = [[w * (0.1 + r() * 0.8), -10]];
  while (main.at(-1)[1] < h * 0.62) {
    const [x, y] = main.at(-1);
    main.push([x + (r() - 0.5) * 70, y + 18 + r() * 34]);
  }
  const points = [main];
  for (let b = 0; b < 2; b++) {
    const from = main[2 + Math.floor(r() * (main.length - 3))];
    const branch = [from];
    for (let i = 0; i < 4; i++) branch.push([branch.at(-1)[0] + (r() - 0.3) * 50, branch.at(-1)[1] + 16 + r() * 22]);
    points.push(branch);
  }
  return { points, life: 1 };
}

function frame(t) {
  raf = requestAnimationFrame(frame);
  if (t - last < FRAME) return;
  const dt = Math.min(3, (t - last) / FRAME);
  last = t;
  const c = canvas();
  const ctx = c.getContext("2d");
  const w = c.clientWidth, h = c.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = "round";
  const push = gust * (DRAG[kind] ?? 0.5);
  gust *= Math.pow(0.9, dt);

  // The parallax follows the cursor slowly; the cursor's own speed stirs the air near it.
  const tx = pointer.on ? pointer.x / w - 0.5 : 0, ty = pointer.on ? pointer.y / h - 0.5 : 0;
  pointer.sx += (tx - pointer.sx) * 0.08 * dt;
  pointer.sy += (ty - pointer.sy) * 0.08 * dt;
  const pvx = (pointer.x - pointer.px) / dt, pvy = (pointer.y - pointer.py) / dt;
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  const reach = 120 * Math.min(1.5, 0.5 + strength / 2);
  const rain = kind === "rain" || kind === "downpour";

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const prevY = p.y;
    p.vx += (p.bx - p.vx) * 0.04 * dt;
    p.vy += (p.by - p.vy) * 0.04 * dt;
    p.x += (p.vx + push) * speed * dt;
    p.y += p.vy * speed * dt;
    if (kind === "snow") p.x += Math.sin((t / 1200) + i) * 0.3 * p.z;
    const ox = -pointer.sx * 36 * p.z, oy = -pointer.sy * 22 * p.z;
    const x = p.x + ox, y = p.y + oy;
    let glint = 0;
    if (pointer.on) {
      const dx = x - pointer.x, dy = y - pointer.y;
      const d = Math.hypot(dx, dy) || 1;
      if (rain) {
        // The cursor is an umbrella: drops break on its top.
        if (Math.abs(dx) < 34 && dy > -6 && dy < 6 && p.vy > 0) {
          splash(x, pointer.y - 4, p.a);
          parts[i] = spawn(w, h, false);
          continue;
        }
      } else if (d < reach) {
        const f = (1 - d / reach) * 0.6 * dt;
        p.vx += (dx / d) * f + pvx * 0.012 * f;
        p.vy += (dy / d) * f + pvy * 0.012 * f;
        glint = 1 - d / reach;
      }
    }
    const floor = kind === "snow" && y > h - 2;
    if (floor) settle(x, h - p.r * 0.5, p);
    if (floor || land(p, x, y, prevY + oy) || p.y > h + 30 || p.x < -80 || p.x > w + 80 || p.y < -90) {
      parts[i] = spawn(w, h, kind === "dust" || kind === "bokeh");
      continue;
    }
    const a = Math.min(1, p.a * (1 + glint * 2.2));
    if (p.len) {
      ctx.strokeStyle = `rgba(${color},${a})`;
      ctx.lineWidth = p.r;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (p.vx + push) * p.len * 0.12, y - p.len);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(${color},${a})`;
      ctx.beginPath();
      ctx.arc(x, y, p.r * (1 + glint * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Settled snow melts in about ten seconds (on the floor in twenty); splashes fall back fast.
  bits = bits.filter((b) => (b.life -= dt / (b.still ? (b.y > h - 8 ? 600 : 300) : 30)) > 0);
  for (const b of bits) {
    if (!b.still) {
      b.vy += 0.35 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    ctx.fillStyle = `rgba(${color},${b.a * Math.min(1, b.life * 3)})`;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rain runs down the glass beside the book: a drop holds, then slips.
  if (rain) {
    if (drops.length < 16 * strength && Math.random() < 0.04 * dt) {
      const x = Math.random() * w;
      if (!edge || x < edge.x - 10 || x > edge.x + edge.w + 10) drops.push({ x, y: Math.random() * h * 0.7, r: 1.5 + Math.random() * 3, v: 0, hold: 30 + Math.random() * 90 });
    }
    drops = drops.filter((d) => d.y < h + 10);
    for (const d of drops) {
      if ((d.hold -= dt) < 0) {
        d.v = Math.min(5, d.v + 0.12 * dt);
        if (Math.random() < 0.02) d.hold = 10 + Math.random() * 40;
      } else d.v *= 0.8;
      d.y += d.v * dt;
      ctx.fillStyle = `rgba(${color},0.16)`;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r * 0.8, d.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${color},0.35)`;
      ctx.beginPath();
      ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  rings = rings.filter((r) => (r.life -= dt / 22) > 0);
  for (const r of rings) {
    r.r += 9 * dt;
    ctx.strokeStyle = `rgba(${color},${0.35 * r.life})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (bolt && (bolt.life -= dt / 6) > 0) {
    for (const [width, alpha] of [[7, 0.12], [2.2, 0.9]]) {
      ctx.strokeStyle = `rgba(235,240,255,${alpha * bolt.life * Math.min(1, strength)})`;
      ctx.lineWidth = width;
      for (const line of bolt.points) {
        ctx.beginPath();
        line.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
    }
  }
  if (lightning && t > nextFlash) {
    nextFlash = t + 6000 + Math.random() * 12000;
    bolt = makeBolt(w, h);
    onStrike();
  }
}

export function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  parts = [];
  bits = [];
  drops = [];
  rings = [];
  bolt = null;
  const c = canvas();
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
}

/**
 * @param {{kind?: string, density?: number, speed?: number, lightning?: boolean}} p
 * @param {string} rgb "r,g,b"
 * @param {number} fx the reader's effect strength, 0 to 2
 */
export function start(p, rgb, fx = 1) {
  stop();
  kind = p.kind ?? "none";
  if (kind === "none" || calm() || !(kind in BASE) || fx <= 0) return;
  speed = p.speed ?? 1;
  strength = fx;
  lightning = !!p.lightning;
  color = rgb;
  nextFlash = performance.now() + 5000;
  resize();
  const c = canvas();
  const count = Math.round((BASE[kind] * (p.density ?? 0.5) * fx * c.clientWidth * c.clientHeight) / 1e6);
  parts = Array.from({ length: Math.min(count, 900) }, () => spawn(c.clientWidth, c.clientHeight, true));
  if (!document.hidden) raf = requestAnimationFrame(frame);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(raf);
    raf = 0;
  } else if (parts.length && !raf) {
    raf = requestAnimationFrame(frame);
  }
});
addEventListener("resize", () => parts.length && resize());
