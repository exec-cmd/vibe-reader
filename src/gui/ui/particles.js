// One canvas of particles behind the text, at most 30 frames per second.
// Stops when the window is hidden, in lite mode and when motion is reduced.

import { calm } from "./core.js";

/** @typedef {{x: number, y: number, vx: number, vy: number, r: number, a: number, len: number}} P */

const canvas = () => /** @type {HTMLCanvasElement} */ (document.getElementById("fx"));
const FRAME = 1000 / 30;
/** Particles per million square pixels at density 1. */
const BASE = { dust: 60, rain: 260, downpour: 520, snow: 160, bokeh: 22 };

let kind = "none";
let speed = 1;
let lightning = false;
/** @type {P[]} */
let parts = [];
let raf = 0;
let last = 0;
let nextFlash = 0;
let flash = 0;
let color = "255,255,255";

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
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    p.x += p.vx * speed * dt;
    p.y += p.vy * speed * dt;
    if (kind === "snow") p.x += Math.sin((t / 1200) + i) * 0.3;
    if (p.y > h + 30 || p.x < -60 || p.x > w + 60 || p.y < -80) {
      parts[i] = spawn(w, h, kind === "dust" || kind === "bokeh");
      continue;
    }
    if (p.len) {
      ctx.strokeStyle = `rgba(${color},${p.a})`;
      ctx.lineWidth = p.r;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * p.len * 0.12, p.y - p.len);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(${color},${p.a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // A faint flash, never more often than every 6 seconds.
  if (lightning && t > nextFlash) {
    flash = 1;
    nextFlash = t + 6000 + Math.random() * 9000;
  }
  if (flash > 0) {
    ctx.fillStyle = `rgba(${color},${0.1 * flash})`;
    ctx.fillRect(0, 0, w, h);
    flash = Math.max(0, flash - 0.12 * dt);
  }
}

export function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  parts = [];
  const c = canvas();
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
}

/** @param {{kind?: string, density?: number, speed?: number, lightning?: boolean}} p @param {string} rgb "r,g,b" */
export function start(p, rgb) {
  stop();
  kind = p.kind ?? "none";
  if (kind === "none" || calm() || !(kind in BASE)) return;
  speed = p.speed ?? 1;
  lightning = !!p.lightning;
  color = rgb;
  nextFlash = performance.now() + 6000;
  resize();
  const c = canvas();
  const count = Math.round((BASE[kind] * (p.density ?? 0.5) * c.clientWidth * c.clientHeight) / 1e6);
  parts = Array.from({ length: Math.min(count, 600) }, () => spawn(c.clientWidth, c.clientHeight, true));
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
