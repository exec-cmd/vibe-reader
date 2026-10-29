// Settings: a full page with sections. Every change applies at once and is saved to config.toml.

import { $, applyConfig, call, commands, escapeHtml, fail, saveConfig, show, state } from "./core.js";
import { loadLocale, t, translate } from "./i18n.js";
import * as sound from "./sound.js";
import { LANGUAGES, languageName } from "./translator.js";
import { ask, confirmAction, icon, paintIcons, toast } from "./ui.js";

/** Fonts shipped in ui/fonts; keep in sync with vibe_reader_core::config::FONTS. */
export const FONTS = ["Literata", "Spectral", "Cormorant Garamond", "Playfair Display", "Onest", "JetBrains Mono"];

const SECTIONS = [
  ["appearance", "sun"],
  ["reading", "bookOpen"],
  ["pdf", "page"],
  ["library", "books"],
  ["atmosphere", "sparkle"],
  ["sound", "sound"],
  ["translator", "translate"],
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
/** @typedef {{id: string, name: string, description: string, modes: string[], spine: string | null,
 *   palettes: Record<string, Record<string, string>>, background: string | null, particles: string | null, sound: string | null}} PresetInfo */
/** @type {PresetInfo[]} */
let presets = [];
const SOUNDS = ["rain", "storm", "fire", "wind", "hum"];

export function open(/** @type {string} */ to = section) {
  returnTo = state.view === "reader" ? "reader" : "home";
  section = to;
  show("settings");
  render();
}

export function close() {
  if (returnTo !== "reader") sound.stop();
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

function textField(/** @type {string} */ value, /** @type {string} */ type, /** @type {string} */ placeholder, /** @type {(v: string) => void} */ onChange) {
  const el = document.createElement("input");
  el.className = "input text-field";
  el.type = type;
  el.value = value;
  el.placeholder = placeholder;
  el.spellcheck = false;
  el.autocomplete = "off";
  el.addEventListener("change", () => onChange(el.value.trim()));
  el.addEventListener("keydown", (e) => e.stopPropagation());
  return el;
}

function button(/** @type {string} */ label, /** @type {string} */ iconName, /** @type {() => void} */ run, cls = "btn") {
  const b = document.createElement("button");
  b.className = cls;
  b.innerHTML = `${icon(/** @type {any} */ (iconName), 15)}<span></span>`;
  b.querySelector("span").textContent = label;
  b.addEventListener("click", run);
  return b;
}

/** A small picture of a preset: its desk, a sheet with lines of ink and an accent. */
function presetPreview(/** @type {PresetInfo} */ p) {
  const mode = p.palettes[document.documentElement.dataset.mode] ? document.documentElement.dataset.mode : p.modes[0];
  const c = p.palettes[mode] ?? {};
  const el = document.createElement("span");
  el.className = "preset-preview";
  el.dataset.bg = p.background ?? "";
  el.style.cssText = `--pd:${c.paper_2 ?? c.paper};--pp:${c.paper};--pi:${c.ink};--pa:${c.accent ?? c.ink};--ps:${c.spine ?? p.spine ?? c.accent}`;
  el.innerHTML = `<i class="sheet"><b class="h"></b><b></b><b></b><b></b><b class="s"></b></i><i class="spine"></i>`;
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
      group(t("window"), [
        row(t("opacity"), t("opacityHint"), slider(r.opacity, 0.4, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => ((r.opacity = v), changed()))),
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
        row(t("pageTurn"), t("pageTurnHint"), segmented([["curl", t("turnCurl")], ["slide", t("turnSlide")], ["none", t("turnNone")]], r.page_turn, (v) => ((r.page_turn = v), changed()))),
        row(t("autohide"), t("autohideHint"), toggle(r.autohide, (v) => ((r.autohide = v), changed()))),
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
      shelfManager(),
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
      b.innerHTML = `<b></b><small></small><span class="tags"></span>`;
      b.querySelector("b").textContent = p.name;
      b.querySelector("small").textContent = p.description;
      b.querySelector(".tags").textContent = [p.modes.length === 1 ? t(p.modes[0] === "dark" ? "modeDark" : "modeLight") : "", p.sound && p.sound !== "none" ? t(`sound_${p.sound}`) : ""].filter(Boolean).join(", ");
      b.prepend(presetPreview(p));
      b.addEventListener("click", () => {
        r.preset = p.id;
        changed(true);
      });
      cards.append(b);
    }
    return [
      group(t("defaultAtmosphere"), [cards]),
      group(t("effects"), [
        row(t("effectStrength"), t("effectStrengthHint"), slider(r.effects, 0, 2, 0.1, (v) => (v === 0 ? t("off") : `${Math.round(v * 100)}%`), (v) => ((r.effects = v), changed()))),
        row(t("particles"), t("particlesHint"), toggle(r.particles, (v) => ((r.particles = v), changed()))),
        row(t("customDesign"), t("customDesignHint"), `<code class="path-code"></code>`),
      ]),
    ];
  },

  sound() {
    const r = state.config.reader;
    const list = document.createElement("div");
    list.className = "sound-list";
    for (const kind of SOUNDS) {
      const item = document.createElement("div");
      item.innerHTML = `<span></span><small></small>`;
      item.querySelector("span").textContent = t(`sound_${kind}`);
      item.querySelector("small").textContent = presets.filter((p) => p.sound === kind).map((p) => p.name).join(", ");
      item.append(button(t("listen"), "play", () => {
        sound.play({ kind, volume: 0.7 }, r.volume || 0.5);
        clearTimeout(listening);
        listening = setTimeout(() => sound.stop(), 6000);
      }, "btn quiet"));
      list.append(item);
    }
    return [
      group("", [
        row(t("soundSetting"), t("soundHint"), toggle(r.sound, (v) => ((r.sound = v), changed()))),
        row(t("volume"), "", slider(r.volume, 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => ((r.volume = v), changed()))),
      ]),
      group(t("soundKinds"), [list]),
    ];
  },

  translator() {
    const tr = state.config.translate;
    const keyField = { google: "google_key", deepl: "deepl_key", openrouter: "openrouter_key" }[tr.provider] ?? "deepl_key";
    const codes = [...new Set([tr.target, ...LANGUAGES])].filter((c) => c !== "auto");
    const check = button(t("checkTranslator"), "translate", async () => {
      check.disabled = true;
      try {
        toast(await call("translate", { text: t("checkPhrase"), target: tr.target === "auto" ? "en" : tr.target }));
      } catch (e) {
        toast(String(e));
      }
      check.disabled = false;
    });
    const rows = [
      row(t("provider"), t(`providerHint_${tr.provider}`), segmented([["deepl", "DeepL"], ["google", "Google"], ["openrouter", "OpenRouter"]], tr.provider, (v) => ((tr.provider = v), changed(true)))),
      row(t("apiKey"), t("apiKeyHint"), textField(tr[keyField], "password", t("apiKeyPlaceholder"), (v) => ((tr[keyField] = v), changed()))),
    ];
    if (tr.provider === "openrouter") rows.push(row(t("model"), t("modelHint"), textField(tr.openrouter_model, "text", "openai/gpt-4o-mini", (v) => ((tr.openrouter_model = v || tr.openrouter_model), changed()))));
    rows.push(
      row(t("targetLanguage"), "", dropdown([["auto", t("interfaceLanguage")], ...codes.map((c) => [c, languageName(c)])], tr.target, (v) => ((tr.target = v), changed()))),
      row(t("checkTranslatorLabel"), t("checkTranslatorHint"), check),
    );
    return [group("", rows), group(t("translatorUse"), [row(t("translatorUseText"), "", "")])];
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
      group(t("agentsInbox"), [row(t("agentsInboxText"), t("agentsInboxHint"), "")]),
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

let listening = 0;

/** Shelves of the library: rename, delete, create. */
function shelfManager() {
  const box = document.createElement("div");
  const section = group(t("shelves"), [box]);
  const load = async () => {
    const { shelves } = await call("library").catch(() => ({ shelves: [] }));
    box.replaceChildren();
    if (!shelves.length) box.append(row(t("noShelvesYet"), t("createFirstShelf"), ""));
    for (const shelf of shelves) {
      const actions = document.createElement("div");
      actions.className = "row-actions";
      actions.append(
        button(t("rename"), "edit", async () => {
          const to = await ask(t("renameShelf"), t("shelfName"), shelf.name);
          if (to && to !== shelf.name) await call("rename_shelf", { from: shelf.name, to }).catch(fail);
          load();
        }, "btn quiet"),
        button(t("delete"), "trash", async () => {
          if (await confirmAction(t("deleteShelf"), t("deleteShelfText", { name: shelf.name }), t("delete"))) await call("delete_shelf", { name: shelf.name }).catch(fail);
          load();
        }, "btn quiet danger"),
      );
      box.append(row(shelf.name, t("booksN", { n: shelf.books }), actions));
    }
    box.append(row("", "", button(t("newShelf"), "plus", async () => {
      const name = await ask(t("newShelf"), t("shelfName"));
      if (name) await call("create_shelf", { name }).catch(fail);
      load();
    })));
  };
  load();
  return section;
}

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
  ["Y", "translator"],
  ["R", "rememberPlace"],
  ["S", "soundToggle"],
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
  content.querySelector("h2").insertAdjacentHTML("afterend", `<p class="set-intro">${escapeHtml(t(`intro_${section}`))}</p>`);
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
