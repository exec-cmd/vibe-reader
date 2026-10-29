// Entry point: boot, views, keyboard, files.

import { $, applyConfig, call, commands, fail, on, saveConfig, show, state } from "./core.js";
import { loadLocale, t, translate } from "./i18n.js";
import * as library from "./library.js";
import * as palette from "./palette.js";
import * as reader from "./reader.js";
import * as settings from "./settings.js";
import { closeMenus, paintIcons, progress, toast } from "./ui.js";

const FILE_TYPES = ["epub", "fb2", "md", "markdown", "txt", "html", "htm", "pdf"];

async function openBook(/** @type {number} */ id) {
  try {
    await library.setMini(false);
    const opened = await call("open_book", { id });
    show("reader");
    await reader.open(opened);
  } catch (e) {
    fail(e);
  }
}

async function openPath(/** @type {string} */ path) {
  await library.setMini(false);
  const opened = await call("open_path", { path });
  show("reader");
  await reader.open(opened);
}

async function goHome() {
  if (state.lite) return;
  reader.leave();
  show("home");
  await library.refresh().catch(fail);
}

async function addFiles(/** @type {string[]} */ paths) {
  const added = await call("add_files", { paths });
  await library.refresh();
  if (added.length) {
    library.selectBook(added[0].id);
    toast(added.length === 1 ? t("addedOne", { title: added[0].title }) : t("addedMany", { n: added.length }), {
      action: added.length === 1 ? t("read") : undefined,
      run: () => openBook(added[0].id),
    });
  }
}

async function pickFiles() {
  const picked = await window.__TAURI__.dialog.open({ multiple: true, filters: [{ name: t("books"), extensions: FILE_TYPES }] });
  if (picked) await addFiles(Array.isArray(picked) ? picked : [picked]).catch(fail);
}

function applyTypography() {
  applyConfig();
  saveConfig();
  requestAnimationFrame(() => reader.relayoutKeepingPlace());
}

function toggleMode() {
  settings.toggleMode();
  reader.onModeChange();
}

/** Keys of the current view. Returns true when handled. */
function onKey(/** @type {KeyboardEvent} */ e) {
  const typing = /** @type {HTMLElement} */ (e.target).closest?.("input, textarea, select");
  const key = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.shiftKey && key === "p") {
    palette.isOpen() ? palette.close() : palette.open();
    return true;
  }
  if (palette.isOpen()) return false;
  if (ctrl && key === ",") {
    state.view === "settings" ? settings.close() : settings.open();
    return true;
  }
  if (ctrl && key === "o" && !state.lite) {
    pickFiles();
    return true;
  }
  if (e.key === "F11") {
    reader.toggleFullscreen();
    return true;
  }
  if (state.view === "reader" && ctrl && key === "f") {
    reader.showTab("search");
    return true;
  }
  if (state.view === "reader" && ctrl && ["=", "+", "-", "0"].includes(e.key)) {
    reader.zoom(e.key === "-" ? "out" : e.key === "0" ? "reset" : "in");
    return true;
  }
  if (typing || ctrl || e.altKey) return false;

  if (e.key === "Escape") {
    closeMenus();
    if (state.view === "settings") settings.close();
    else if (state.view === "reader" && !reader.closeOverlays()) goHome();
    else if (state.view === "home") library.onKey(e);
    return true;
  }
  if (state.view === "home") {
    if (key === "m") library.toggleMini();
    else if (e.key === "/") $("#search").focus();
    else return library.onKey(e);
    return true;
  }
  if (state.view !== "reader") return false;
  const vim = state.config.reader.vim;
  /** @type {Record<string, () => unknown>} */
  const map = {
    ArrowRight: reader.next, ArrowLeft: reader.prev, PageDown: reader.next, PageUp: reader.prev, " ": e.shiftKey ? reader.prev : reader.next,
    ArrowDown: () => reader.scrollBy(60), ArrowUp: () => reader.scrollBy(-60),
    Home: reader.chapterStart, End: reader.chapterEnd,
    t: () => reader.toggleSide(), n: () => reader.showTab("notes"),
    y: () => commands.get("translate")?.run(), r: () => commands.get("remember-place")?.when?.() && reader.rememberPlace(), s: reader.toggleSound,
    "]": reader.nextChapter, "[": reader.prevChapter, l: reader.cycleLayout, b: reader.bookmark, d: toggleMode,
    g: reader.focusPageInput, "+": () => reader.zoom("in"), "=": () => reader.zoom("in"), "-": () => reader.zoom("out"), "0": () => reader.zoom("reset"),
  };
  if (vim) {
    Object.assign(map, { l: reader.next, h: reader.prev, j: () => reader.scrollBy(60), k: () => reader.scrollBy(-60), G: reader.chapterEnd, g: reader.chapterStart });
  }
  const action = map[e.key] ?? map[key];
  if (!action) return false;
  action();
  return true;
}

async function boot() {
  const boot = await call("boot");
  state.config = boot.config;
  state.lite = boot.lite;
  state.version = boot.version;
  state.paths = boot.paths;
  document.body.classList.toggle("lite", state.lite);
  applyConfig();
  await loadLocale(state.config.reader.locale);
  translate();
  paintIcons();

  library.setOnOpen(openBook);
  library.init();
  reader.init({ goHome });
  await settings.init();
  settings.setOnReadingChange(() => {
    reader.relayoutKeepingPlace();
    if (state.view === "reader") reader.onModeChange();
  });
  palette.init();
  commands.set("open", { label: () => t("addBooks"), run: pickFiles, when: () => !state.lite, key: "Ctrl+O" });
  commands.set("library", { label: () => t("library"), run: goHome, when: () => !state.lite && state.view !== "home" });
  commands.set("mode", { label: () => t("cmdMode"), run: toggleMode, key: "D" });

  addEventListener("keydown", (e) => {
    if (onKey(e)) e.preventDefault();
  });
  $("#open-files").addEventListener("click", pickFiles);
  $("#open-settings").addEventListener("click", () => settings.open());
  on("live-open", ({ payload }) => openPath(payload).catch(fail));
  on("import-progress", ({ payload }) => {
    if (payload.done >= payload.total) {
      progress(null);
      if (payload.failed?.length) toast(t("importFailed", { n: payload.failed.length, first: payload.failed[0] }));
    } else progress({ label: t("importing", { done: payload.done + 1, total: payload.total, name: payload.name }), done: payload.done, total: payload.total });
  });
  on("ui-changed", ({ payload }) => {
    if (payload.every((/** @type {string} */ p) => p.endsWith(".css"))) {
      for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
        const l = /** @type {HTMLLinkElement} */ (link);
        l.href = `${l.href.split("?")[0]}?${Date.now()}`;
      }
      setTimeout(reader.relayoutKeepingPlace, 200);
    } else location.reload();
  });
  if (!state.lite) {
    let hint = null;
    window.__TAURI__.webview.getCurrentWebview().onDragDropEvent((/** @type {any} */ e) => {
      if (e.payload.type === "enter" || e.payload.type === "over") {
        if (!hint) {
          hint = document.createElement("div");
          hint.className = "drop-zone";
          document.body.append(hint);
        }
      } else {
        hint?.remove();
        hint = null;
        if (e.payload.type === "drop") addFiles(e.payload.paths).catch(fail);
      }
    });
  }

  if (boot.initial) {
    await openPath(boot.initial).catch(fail);
  } else {
    show("home");
    await library.refresh();
    if (state.config.library.start_mini) await library.setMini(true);
  }
  requestAnimationFrame(() => call("ready"));
}

/** @type {any} */ (window).vibe = {
  goHome,
  openBook,
  pickFiles,
  saveConfig,
  applyTypography,
  toggleMode,
  openSettings: (/** @type {string} */ section) => settings.open(section),
};
boot().catch(fail);
