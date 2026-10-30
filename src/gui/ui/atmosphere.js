// Applies a resolved atmosphere profile to the reader: tokens, background, effects, particles,
// sound, heading style and the chapter illustration.

import * as band from "./band.js";
import { $, state } from "./core.js";
import * as particles from "./particles.js";
import * as sound from "./sound.js";

/** @typedef {{ mode: "light" | "dark", preset: string, palette: Record<string, string>, type: {display?: string, body?: string},
 *   background: {kind?: string, image?: string, dim?: number}, particles: object, chapter: {heading?: string, illustration?: string},
 *   effects: {grain?: number, vignette?: number, glow?: number}, sound: {kind?: string, volume?: number}, css: string | null }} Look */

// The profile's paper is the sheet the text sits on; paper_2 is the desk around it.
const TOKENS = { paper: "--page", paper_2: "--desk", ink: "--ink", muted: "--muted", rule: "--rule", accent: "--accent" };
let applied = "";

/** Forgets the applied look so the next apply() redraws everything. */
export const reset = () => (applied = "");

/** The sound of the applied look, kept for the sound switch. @type {Look["sound"] | null} */
let currentSound = null;

/** Starts or stops the ambient sound after the reader flips the switch or the volume. */
export function updateSound() {
  const r = state.config.reader;
  if (r.sound && currentSound && !state.lite && state.view === "reader") sound.play(currentSound, r.volume);
  else sound.stop();
}

// Lightning lights the room and, with sound on, thunder follows.
particles.setOnStrike(() => {
  const flash = $("#flash");
  flash.classList.remove("on");
  void flash.offsetWidth;
  flash.classList.add("on");
  sound.thunder();
});

const rgb = (/** @type {string} */ hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(",");
};

/** @param {Look | null} look */
export function apply(look) {
  const key = JSON.stringify(look);
  if (key === applied) return;
  applied = key;
  const reader = $("#reader");
  const style = reader.style;
  for (const token of [...Object.values(TOKENS), "--font-display", "--font-body", "--grain", "--vignette", "--glow", "--fx"]) {
    style.removeProperty(token);
  }
  $("#preset-css").textContent = "";
  const strength = state.config.reader.effects ?? 1;
  style.setProperty("--fx", String(strength));
  if (!look) {
    delete reader.dataset.mode;
    reader.dataset.preset = reader.dataset.bg = reader.dataset.heading = "";
    $("#bg").removeAttribute("style");
    particles.stop();
    band.toggle(false);
    currentSound = null;
    updateSound();
    return;
  }
  reader.dataset.mode = look.mode;
  reader.dataset.preset = look.preset;
  reader.dataset.heading = look.chapter.heading ?? "plain";
  reader.dataset.bg = look.background.kind ?? "none";
  for (const [name, token] of Object.entries(TOKENS)) if (look.palette[name]) style.setProperty(token, look.palette[name]);
  if (look.type.display) style.setProperty("--font-display", `"${look.type.display}", serif`);
  // The reader's own font choice wins over the atmosphere.
  if (look.type.body && state.config.typography.font === "auto") style.setProperty("--font-body", `"${look.type.body}", Georgia, serif`);
  style.setProperty("--grain", String(look.effects.grain ?? 0));
  style.setProperty("--vignette", String(look.effects.vignette ?? 0));
  style.setProperty("--glow", String(look.effects.glow ?? 0));
  const bg = $("#bg");
  bg.removeAttribute("style");
  if (look.background.kind === "image" && look.background.image) {
    bg.style.backgroundImage = `url("/art/${encodeURIComponent(look.background.image)}")`;
  }
  $("#preset-css").textContent = look.css ?? "";
  // The grid desk (Terminal) wears the ASCII band along its top.
  band.toggle(look.background.kind === "grid" && strength > 0 && !state.lite);
  if (state.config.reader.particles) particles.start(look.particles, rgb(look.palette.ink ?? "#ffffff"), strength);
  else particles.stop();
  currentSound = look.sound ?? null;
  updateSound();
}

/** Built-in chapter drawings, colored by the palette. */
const ILLUSTRATIONS = {
  hills: `<circle cx="470" cy="44" r="20" fill="var(--accent)"/><path d="M0 86C110 56 200 98 310 74S500 58 600 84V120H0Z" fill="var(--ink)" opacity=".3"/><path d="M0 102C120 80 230 112 340 94S520 84 600 100V120H0Z" fill="var(--ink)" opacity=".7"/>`,
  blinds: Array.from({ length: 8 }, (_, i) => `<rect x="0" y="${8 + i * 14}" width="600" height="6" fill="var(--ink)" opacity="${0.08 + i * 0.03}"/>`).join("") + `<rect x="420" y="0" width="3" height="120" fill="var(--ink)" opacity=".5"/>`,
  orbs: `<circle cx="150" cy="60" r="44" fill="var(--accent)" opacity=".18"/><circle cx="310" cy="44" r="28" fill="var(--accent)" opacity=".28"/><circle cx="460" cy="70" r="52" fill="var(--accent)" opacity=".14"/>`,
  rain: Array.from({ length: 36 }, (_, i) => { const x = (i * 71) % 600, y = (i * 29) % 90; return `<line x1="${x}" y1="${y}" x2="${x - 6}" y2="${y + 18}" stroke="var(--accent)" stroke-width="1.2" opacity=".5"/>`; }).join("") + `<path d="M0 104L90 96L170 106L260 92L360 104L460 94L600 102V120H0Z" fill="var(--ink)" opacity=".6"/>`,
  bolt: `<ellipse cx="180" cy="10" rx="190" ry="32" fill="var(--ink)" opacity=".35"/><ellipse cx="460" cy="6" rx="200" ry="30" fill="var(--ink)" opacity=".45"/><polygon points="318,8 290,58 310,58 286,116 350,46 328,46 350,8" fill="var(--accent)"/>`,
  ridge: `<path d="M0 82L80 46L150 70L250 24L330 64L420 36L520 72L600 50V120H0Z" fill="var(--ink)" opacity=".2"/><path d="M0 100L110 66L190 88L300 52L400 90L510 62L600 92V120H0Z" fill="var(--ink)" opacity=".45"/><path d="M0 114L130 94L240 108L360 88L480 110L600 98V120H0Z" fill="var(--ink)" opacity=".8"/>`,
  terminal: `<rect x="1" y="1" width="598" height="118" rx="6" fill="none" stroke="var(--rule)"/><text x="24" y="44" font-family="JetBrains Mono" font-size="16" fill="var(--accent)">$ vibe-reader read --continue</text><rect x="24" y="62" width="12" height="20" fill="var(--accent)" opacity=".8"/>`,
};

/** Puts the chapter illustration at the start of the page unless art already sits there. */
export function illustrate(/** @type {HTMLElement} */ page, /** @type {Look | null} */ look) {
  const kind = look?.chapter.illustration;
  if (!kind || kind === "none" || !(kind in ILLUSTRATIONS) || page.querySelector(".art-chapter")) return;
  const figure = document.createElement("figure");
  figure.className = "illustration";
  figure.dataset.skip = "";
  figure.innerHTML = `<svg viewBox="0 0 600 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${ILLUSTRATIONS[kind]}</svg>`;
  page.prepend(figure);
}
