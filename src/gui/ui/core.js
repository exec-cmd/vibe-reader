// Shared state and helpers for the UI modules.

/** @typedef {{ reader: {locale: string, preset: string, mode: string, vim: boolean, reduce_motion: boolean},
 *   typography: {font: string, size: number, width: number, line_height: number, justify: boolean, hyphens: boolean},
 *   agent: object }} Config */
/** @typedef {{ id: number, title: string, authors: string[], format: string, kind: string, status: string,
 *   color: string, words: number, chars: number, progress: number, shelves: string[], opened_at: number | null,
 *   position: string | null }} Book */
/** @typedef {{ id: number, kind: "note" | "highlight" | "bookmark", start: string, end: string, quote: string,
 *   body: string, author: string }} Annotation */

/** @type {(cmd: string, args?: object) => Promise<any>} */
export const call = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);
/** @type {(event: string, fn: (e: {payload: any}) => void) => Promise<() => void>} */
export const on = (event, fn) => window.__TAURI__.event.listen(event, fn);

export const $ = (/** @type {string} */ sel, root = document) => /** @type {HTMLElement} */ (root.querySelector(sel));

export const state = {
  /** @type {Config} */ config: /** @type {any} */ (null),
  lite: false,
  /** @type {"home" | "reader" | "settings"} */ view: "home",
  version: "",
  /** @type {{config: string, data: string, ui: string, presets: string}} */ paths: /** @type {any} */ ({}),
};

const VIEWS = { home: "home", reader: "reader", settings: "settings-view" };

/** Commands for the palette: id -> {label, run, when}. */
/** @type {Map<string, {label: () => string, run: () => void, when?: () => boolean, key?: string}>} */
export const commands = new Map();

export function show(/** @type {"home" | "reader" | "settings"} */ view) {
  state.view = view;
  for (const [name, id] of Object.entries(VIEWS)) $(`#${id}`).hidden = name !== view;
}

/** @template {(...args: any[]) => void} F @param {F} fn @param {number} ms */
export function debounce(fn, ms) {
  let timer = 0;
  return /** @type {F} */ ((...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  });
}

export function escapeHtml(/** @type {string} */ s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Parses "ch:3:120" into {chapter: 2, offset: 120}. */
export function parseLocator(/** @type {string} */ s) {
  const m = /^ch:(\d+)(?::(\d+))?$/.exec(s || "");
  return m ? { chapter: Number(m[1]) - 1, offset: Number(m[2] || 0) } : { chapter: 0, offset: 0 };
}

export const locator = (/** @type {number} */ chapter, /** @type {number} */ offset) => `ch:${chapter + 1}:${offset}`;

export const isAgent = (/** @type {string} */ author) => author !== "user";

/** Applies appearance settings to the document. */
export function applyConfig() {
  const { reader, typography: ty } = state.config;
  const root = document.documentElement;
  const dark = reader.mode === "dark" || (reader.mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.mode = dark ? "dark" : "light";
  root.dataset.motion = reader.reduce_motion ? "off" : "on";
  // "auto" leaves the body font to the theme and the atmosphere.
  if (ty.font === "auto") root.style.removeProperty("--font-body");
  else root.style.setProperty("--font-body", `${ty.font === "system" ? "system-ui" : `"${ty.font}"`}, Georgia, serif`);
  root.style.setProperty("--text-size", `${ty.size}px`);
  root.style.setProperty("--measure", `${ty.width}em`);
  root.style.setProperty("--leading", String(ty.line_height));
  root.style.setProperty("--align", ty.justify ? "justify" : "left");
  root.style.setProperty("--hyphens", ty.hyphens ? "auto" : "manual");
}

export const saveConfig = debounce(() => call("save_config", { config: state.config }).catch(fail), 400);

export function fail(/** @type {unknown} */ e) {
  console.error(e);
  Promise.all([import("./i18n.js"), import("./ui.js")]).then(([{ t }, { toast }]) => toast(t("error", { message: String(e) })));
}

/** True when animations should be skipped. */
export function calm() {
  return state.lite || state.config?.reader.reduce_motion || matchMedia("(prefers-reduced-motion: reduce)").matches;
}
