// Settings: a full page with sections. Every change applies at once and is saved to config.toml.

import { $, applyConfig, call, commands, escapeHtml, saveConfig, show, state } from "./core.js";
import { loadLocale, t, translate } from "./i18n.js";
import { icon, paintIcons, toast } from "./ui.js";

/** Fonts shipped in ui/fonts; keep in sync with vibe_reader_core::config::FONTS. */
export const FONTS = ["Literata", "Spectral", "Cormorant Garamond", "Playfair Display", "Onest", "JetBrains Mono"];

const SECTIONS = [
  ["appearance", "sun"],
  ["reading", "bookOpen"],
  ["pdf", "page"],
  ["library", "books"],
  ["atmosphere", "sparkle"],
  ["agents", "agent"],
  ["keys", "key"],
  ["about", "info"],
];

let section = "appearance";
/** @type {"home" | "reader"} */
let returnTo = "home";
/** Set by app.js after a reading setting changes. @type {() => void} */
export let onReadingChange = () => {};
export const setOnReadingChange = (/** @type {() => void} */ fn) => (onReadingChange = fn);
/** @type {{id: string, name: string, description: string, modes: string[], spine: string | null}[]} */
let presets = [];

export function open(/** @type {string} */ to = section) {
  returnTo = state.view === "reader" ? "reader" : "home";
  section = to;
  show("settings");
  render();
}

export function close() {
  show(returnTo);
  onReadingChange();
}

function changed(rerender = false) {
  applyConfig();
  saveConfig();
  if (rerender) render();
}

// ---------- controls ----------

function row(/** @type {string} */ label, /** @type {string} */ hint, /** @type {HTMLElement | string} */ control) {
  const el = document.createElement("div");
  el.className = "set-row";
  el.innerHTML = `<div class="set-text"><div class="set-label"></div>${hint ? `<div class="set-hint"></div>` : ""}</div><div class="set-control"></div>`;
  el.querySelector(".set-label").textContent = label;
  if (hint) el.querySelector(".set-hint").textContent = hint;
  const slot = el.querySelector(".set-control");
  typeof control === "string" ? (slot.innerHTML = control) : slot.append(control);
  return el;
}

function toggle(/** @type {boolean} */ value, /** @type {(v: boolean) => void} */ onChange) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "switch";
  input.checked = value;
  input.addEventListener("change", () => onChange(input.checked));
  return input;
}

function segmented(/** @type {[string, string][]} */ options, /** @type {string} */ value, /** @type {(v: string) => void} */ onChange) {
  const el = document.createElement("div");
  el.className = "segmented";
  for (const [v, label] of options) {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute("aria-pressed", String(v === value));
    b.addEventListener("click", () => {
      for (const other of el.children) other.setAttribute("aria-pressed", String(other === b));
      onChange(v);
    });
    el.append(b);
  }
  return el;
}

function slider(/** @type {number} */ value, min, max, step, /** @type {(v: number) => string} */ format, /** @type {(v: number) => void} */ onChange) {
  const el = document.createElement("div");
  el.className = "slider";
  el.innerHTML = `<input class="range" type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
  const input = /** @type {HTMLInputElement} */ (el.querySelector("input"));
  const out = el.querySelector("output");
  input.value = String(value);
  out.textContent = format(value);
  input.addEventListener("input", () => {
    out.textContent = format(Number(input.value));
    onChange(Number(input.value));
  });
  return el;
}

function dropdown(/** @type {[string, string][]} */ options, /** @type {string} */ value, /** @type {(v: string) => void} */ onChange) {
  const el = document.createElement("select");
  el.className = "input native-select";
  for (const [v, label] of options) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = label;
    o.selected = v === value;
    el.append(o);
  }
  el.addEventListener("change", () => onChange(el.value));
  return el;
}

function group(/** @type {string} */ title, /** @type {HTMLElement[]} */ rows) {
  const el = document.createElement("section");
  el.className = "set-group";
  if (title) el.insertAdjacentHTML("beforeend", `<h3>${escapeHtml(title)}</h3>`);
  const box = document.createElement("div");
  box.className = "set-box";
  box.append(...rows);
  el.append(box);
  return el;
}

// ---------- sections ----------

const build = {
  appearance() {
    const r = state.config.reader;
    return [
      group("", [
        row(t("theme"), t("themeHint"), segmented([["auto", t("modeAuto")], ["light", t("modeLight")], ["dark", t("modeDark")]], r.mode, (v) => ((r.mode = v), changed()))),
        row(t("language"), "", segmented([["auto", t("modeAuto")], ["en", "English"], ["ru", "Русский"]], r.locale, async (v) => {
          r.locale = v;
          saveConfig();
          await loadLocale(v);
          translate();
          paintIcons();
          render();
        })),
        row(t("reduceMotion"), t("reduceMotionHint"), toggle(r.reduce_motion, (v) => ((r.reduce_motion = v), changed()))),
      ]),
    ];
  },

  reading() {
    const r = state.config.reader;
    const ty = state.config.typography;
    const fonts = [["auto", t("fontAuto")], ...FONTS.map((f) => [f, f]), ["system", t("systemFont")]];
    const preview = document.createElement("div");
    preview.className = "type-preview";
    preview.innerHTML = `<p>${escapeHtml(t("previewText"))}</p>`;
    const update = () => {
      changed();
      onReadingChange();
    };
    return [
      group(t("layout"), [
        row(t("bookLayout"), t("bookLayoutHint"), segmented([["spread", t("layoutSpread")], ["pages", t("layoutPages")], ["scroll", t("layoutScroll")]], r.layout, (v) => ((r.layout = v), update()))),
      ]),
      group(t("typography"), [
        preview,
        row(t("font"), "", dropdown(fonts, ty.font, (v) => ((ty.font = v), update()))),
        row(t("size"), "", slider(ty.size, 14, 30, 1, (v) => `${v} px`, (v) => ((ty.size = v), update()))),
        row(t("width"), t("widthHint"), slider(ty.width, 22, 50, 1, (v) => `${v} em`, (v) => ((ty.width = v), update()))),
        row(t("leading"), "", slider(ty.line_height, 1.2, 2.2, 0.05, (v) => v.toFixed(2), (v) => ((ty.line_height = v), update()))),
        row(t("justify"), "", toggle(ty.justify, (v) => ((ty.justify = v), update()))),
        row(t("hyphens"), t("hyphensHint"), toggle(ty.hyphens, (v) => ((ty.hyphens = v), update()))),
      ]),
    ];
  },

  pdf() {
    const p = state.config.pdf;
    return [
      group("", [
        row(t("pdfLayout"), t("pdfLayoutHint"), segmented([["spread", t("layoutSpread")], ["single", t("layoutSingle")], ["scroll", t("layoutScroll")]], p.layout, (v) => ((p.layout = v), changed()))),
        row(t("pdfFit"), "", segmented([["page", t("fitPage")], ["width", t("fitWidth")]], p.fit, (v) => ((p.fit = v), changed()))),
        row(t("invertDark"), t("invertDarkHint"), toggle(p.invert_dark, (v) => ((p.invert_dark = v), changed()))),
      ]),
    ];
  },

  library() {
    const l = state.config.library;
    return [
      group("", [
        row(t("startMini"), t("startMiniHint"), toggle(l.start_mini, (v) => ((l.start_mini = v), changed()))),
        row(t("copyOnImport"), t("copyOnImportHint"), toggle(l.copy_on_import, (v) => ((l.copy_on_import = v), changed()))),
        row(t("groupBy"), "", dropdown(["shelf", "author", "format", "status", "none"].map((g) => [g, t(`group_${g}`)]), l.group, (v) => ((l.group = v), changed()))),
        row(t("sortBy"), "", dropdown(["recent", "title", "author", "progress", "added"].map((s) => [s, t(`sort_${s}`)]), l.sort, (v) => ((l.sort = v), changed()))),
      ]),
    ];
  },

  atmosphere() {
    const r = state.config.reader;
    const cards = document.createElement("div");
    cards.className = "preset-grid";
    for (const p of presets) {
      const b = document.createElement("button");
      b.className = "preset-card";
      b.setAttribute("aria-pressed", String(p.id === r.preset));
      b.innerHTML = `<span class="swatch" style="background:${p.spine ?? "var(--accent)"}"></span><b></b><small></small>`;
      b.querySelector("b").textContent = p.name;
      b.querySelector("small").textContent = p.description;
      b.addEventListener("click", () => {
        r.preset = p.id;
        changed(true);
      });
      cards.append(b);
    }
    return [
      group(t("defaultAtmosphere"), [cards]),
      group("", [
        row(t("particles"), t("particlesHint"), toggle(r.particles, (v) => ((r.particles = v), changed()))),
        row(t("customDesign"), t("customDesignHint"), `<code class="path-code"></code>`),
      ]),
    ];
  },

  agents() {
    const c = state.config.agent.consent;
    const cmd = `<code class="path-code">vibe-reader skills install</code>`;
    return [
      group(t("agentsShare"), [
        row(t("consentHabits"), t("consentHabitsHint"), toggle(c.habits, (v) => ((c.habits = v), changed()))),
        row(t("consentSpeed"), t("consentSpeedHint"), toggle(c.speed, (v) => ((c.speed = v), changed()))),
        row(t("consentGenres"), t("consentGenresHint"), toggle(c.genres, (v) => ((c.genres = v), changed()))),
      ]),
      group(t("agentsSetup"), [row(t("installSkills"), t("installSkillsHint"), cmd)]),
    ];
  },

  keys() {
    const r = state.config.reader;
    const list = document.createElement("div");
    list.className = "key-list";
    for (const [keys, label] of KEYS) {
      const item = document.createElement("div");
      item.innerHTML = `<span></span><span class="keys">${keys.split(" ").map((k) => `<kbd class="kbd">${escapeHtml(k)}</kbd>`).join(" ")}</span>`;
      item.firstElementChild.textContent = t(label);
      list.append(item);
    }
    return [
      group("", [row(t("vim"), t("vimHint"), toggle(r.vim, (v) => ((r.vim = v), changed())))]),
      group(t("shortcuts"), [list]),
    ];
  },

  about() {
    const box = document.createElement("div");
    box.className = "about";
    box.innerHTML = `<div class="brand big">vibe-reader</div><p></p><dl class="facts"></dl>`;
    box.querySelector("p").textContent = t("version", { v: state.version });
    const facts = box.querySelector("dl");
    for (const [label, path] of [[t("configFile"), state.paths.config], [t("dataFolder"), state.paths.data], [t("designFolder"), state.paths.ui], [t("presetsFolder"), state.paths.presets]]) {
      facts.insertAdjacentHTML("beforeend", `<dt>${escapeHtml(label)}</dt><dd><button class="link-btn" title="${escapeHtml(t("copyPath"))}"></button></dd>`);
      const b = facts.lastElementChild.querySelector("button");
      b.textContent = path;
      b.addEventListener("click", () => navigator.clipboard.writeText(path).then(() => toast(t("copied"))));
    }
    return [group("", [box])];
  },
};

const KEYS = [
  ["Ctrl+Shift+P", "keyPalette"],
  ["Ctrl+,", "settings"],
  ["Ctrl+O", "addBooks"],
  ["M", "miniMode"],
  ["/", "search"],
  ["→ Space PgDn", "nextPage"],
  ["← PgUp", "prevPage"],
  ["] [", "keyChapters"],
  ["G", "goToPage"],
  ["+ − 0", "keyZoom"],
  ["T", "sidePanel"],
  ["Ctrl+F", "findInBook"],
  ["B", "cmdBookmark"],
  ["L", "layout"],
  ["D", "cmdMode"],
  ["F11", "fullscreen"],
  ["Esc", "backKey"],
];

function render() {
  const view = $("#settings-view");
  view.innerHTML = `
    <header class="toolbar"><button class="icon-btn" id="settings-back" data-icon="back"></button><span class="brand">${t("settings")}</span></header>
    <div class="settings-body"><nav class="settings-nav"></nav><div class="settings-content"><h2></h2></div></div>`;
  view.querySelector("#settings-back").addEventListener("click", close);
  const nav = view.querySelector(".settings-nav");
  for (const [id, iconName] of SECTIONS) {
    const b = document.createElement("button");
    b.className = "side-item";
    b.setAttribute("aria-current", String(id === section));
    b.innerHTML = `${icon(/** @type {any} */ (iconName), 17)}<span class="name"></span>`;
    b.querySelector(".name").textContent = t(`set_${id}`);
    b.addEventListener("click", () => {
      section = id;
      render();
    });
    nav.append(b);
  }
  const content = view.querySelector(".settings-content");
  content.querySelector("h2").textContent = t(`set_${section}`);
  content.append(...build[section]());
  const custom = content.querySelector(".path-code:empty");
  if (custom) custom.textContent = `${state.paths.ui}/user.css`;
  paintIcons(view);
}

export async function init() {
  presets = await call("presets").catch(() => []);
  commands.set("settings", { label: () => t("settings"), run: () => open(), key: "Ctrl+," });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyConfig);
}

/** Flips light and dark from anywhere. */
export function toggleMode() {
  const dark = document.documentElement.dataset.mode === "dark";
  state.config.reader.mode = dark ? "light" : "dark";
  changed();
}
