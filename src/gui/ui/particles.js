// One canvas of particles behind the book, at most 30 frames per second. Particles meet the
// book: snow settles on the top edge of the sheet, rain splashes on it, a page turn sends a gust.
// Stops when the window is hidden, in lite mode and when motion is reduced.

import { calm } from "./core.js";

/** @typedef {{x: number, y: number, vx: number, vy: number, r: number, a: number, len: number}} P */
/** @typedef {{x: number, y: number, vx: number, vy: number, r: number, a: number, life: number, still: boolean}} Bit */

const canvas = () => /** @type {HTMLCanvasElement} */ (document.getElementById("fx"));
const FRAME = 1000 / 30;
/** Particles per million square pixels at density 1. */
const BASE = { dust: 60, rain: 260, downpour: 520, snow: 160, bokeh: 22 };
/** How much a gust moves each kind; heavy rain barely bends. */
const DRAG = { dust: 1, snow: 0.8, bokeh: 0.3, rain: 0.25, downpour: 0.15 };

let kind = "none";
let speed = 1;
let lightning = false;
/** @type {P[]} */
let parts = [];
/** Settled snow and rain splashes. @type {Bit[]} */
let bits = [];
let raf = 0;
let last = 0;
let nextFlash = 0;
let gust = 0;
let color = "255,255,255";
/** Top edge of the sheet in canvas coordinates. @type {{x: number, y: number, w: number} | null} */
let edge = null;
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

/** A gust of air from a turning page: 1 blows right, -1 left. */
export function blow(/** @type {number} */ dir) {
  if (parts.length) gust = dir * 7;
}

function spawn(w, h, anywhere) {
  const r = Math.random;
  const y = anywhere ? r() * h : -20;
  switch (kind) {
    case "dust": return { x: r() * w, y: r() * h, vx: (r() - 0.5) * 0.15, vy: (r() - 0.5) * 0.1, r: 0.6 + r() * 1.4, a: 0.15 + r() * 0.35, len: 0 };
    case "rain": return { x: r() * w * 1.2, y, vx: -1.2, vy: 9 + r() * 4, r: 1, a: 0.12 + r() * 0.2, len: 10 + r() * 10 };
    case "downpour": return { x: r() * w * 1.3, y, vx: -3, vy: 16 + r() * 6, r: 1.2, a: 0.15 + r() * 0.25, len: 16 + r() * 18 };
    case "snow": return { x: r() * w, y, vx: (r() - 0.5) * 0.6, vy: 0.6 + r() * 1.1, r: 1 + r() * 2.2, a: 0.35 + r() * 0.45, len: 0 };
    case "bokeh": return { x: r() * w, y: r() * h, vx: (r() - 0.5) * 0.25, vy: -0.1 - r() * 0.2, r: 18 + r() * 46, a: 0.04 + r() * 0.07, len: 0 };
    default: return null;
  }
}

function resize() {
  const c = canvas();
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  c.width = c.clientWidth * dpr;
  c.height = c.clientHeight * dpr;
  c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Snow and rain that reach the top edge of the sheet stay there for a while or splash. */
function land(/** @type {P} */ p, /** @type {number} */ prevY) {
  if (!edge || p.y < edge.y || prevY >= edge.y || p.x < edge.x || p.x > edge.x + edge.w) return false;
  const r = Math.random;
  if (kind === "snow") {
    if (bits.length < 260) bits.push({ x: p.x, y: edge.y - p.r * 0.5, vx: 0, vy: 0, r: p.r, a: p.a, life: 1, still: true });
  } else if (kind === "rain" || kind === "downpour") {
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      bits.push({ x: p.x, y: edge.y - 1, vx: (r() - 0.5) * 3, vy: -1.5 - r() * 2, r: 0.9, a: p.a * 2, life: 0.35, still: false });
    }
  } else return false;
  return true;
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
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const prevY = p.y;
    p.x += (p.vx + push) * speed * dt;
    p.y += p.vy * speed * dt;
    if (kind === "snow") p.x += Math.sin((t / 1200) + i) * 0.3;
    if (land(p, prevY) || p.y > h + 30 || p.x < -60 || p.x > w + 60 || p.y < -80) {
      parts[i] = spawn(w, h, kind === "dust" || kind === "bokeh");
      continue;
    }
    if (p.len) {
      ctx.strokeStyle = `rgba(${color},${p.a})`;
      ctx.lineWidth = p.r;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + (p.vx + push) * p.len * 0.12, p.y - p.len);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(${color},${p.a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Settled snow melts in about ten seconds; splashes fall back within a third of a second.
  bits = bits.filter((b) => (b.life -= dt / (b.still ? 300 : 30)) > 0);
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
  if (lightning && t > nextFlash) {
    nextFlash = t + 6000 + Math.random() * 12000;
    onStrike();
  }
}

export function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  parts = [];
  bits = [];
  const c = canvas();
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
}

/**
 * @param {{kind?: string, density?: number, speed?: number, lightning?: boolean}} p
 * @param {string} rgb "r,g,b"
 * @param {number} strength the reader's effect strength, 0 to 2
 */
export function start(p, rgb, strength = 1) {
  stop();
  kind = p.kind ?? "none";
  if (kind === "none" || calm() || !(kind in BASE) || strength <= 0) return;
  speed = p.speed ?? 1;
  lightning = !!p.lightning;
  color = rgb;
  nextFlash = performance.now() + 5000;
  resize();
  const c = canvas();
  const count = Math.round((BASE[kind] * (p.density ?? 0.5) * strength * c.clientWidth * c.clientHeight) / 1e6);
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
