// Entry point: boot, views, keyboard, files.

import { $, applyConfig, call, commands, fail, on, show, state, toast } from "./core.js";
import { loadLocale, t, translate } from "./i18n.js";
import * as library from "./library.js";
import * as palette from "./palette.js";
import * as reader from "./reader.js";
import * as settings from "./settings.js";

const FILE_TYPES = ["epub", "fb2", "md", "markdown", "txt", "html", "htm", "pdf"];

async function openBook(/** @type {number} */ id) {
  try {
    const opened = await call("open_book", { id });
    show("reader");
    await reader.open(opened);
  } catch (e) {
    fail(e);
  }
}

async function openPath(/** @type {string} */ path) {
  const opened = await call("open_path", { path });
  show("reader");
  await reader.open(opened);
}

async function goHome() {
  if (state.lite) return;
  reader.closeOverlays();
  show("home");
  await library.refresh().catch(fail);
}

async function addFiles(/** @type {string[]} */ paths) {
  const added = await call("add_files", { paths });
  await library.refresh();
  if (added.length === 1) openBook(added[0].id);
  else if (added.length) toast(t("added"));
}

async function pickFiles() {
  const picked = await window.__TAURI__.dialog.open({ multiple: true, filters: [{ name: "Books", extensions: FILE_TYPES }] });
  if (picked) await addFiles(Array.isArray(picked) ? picked : [picked]).catch(fail);
}

/** Keys that have a meaning in the current view. Returns true when handled. */
function onKey(/** @type {KeyboardEvent} */ e) {
  const typing = /** @type {HTMLElement} */ (e.target).closest?.("input, textarea, select");
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    palette.isOpen() ? palette.close() : palette.open();
    return true;
  }
  if (palette.isOpen() || typing) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;

  if (e.key === "Escape") {
    if (state.view === "reader" && !reader.closeOverlays()) goHome();
    return true;
  }
  if (state.view === "home") {
    if (e.key === "f" || e.key === "F") library.toggleMode();
    else if (e.key === "/") $("#search").focus();
    else if (e.key === "o" || e.key === "O") pickFiles();
    else return false;
    return true;
  }
  const vim = state.config.reader.vim;
  const map = {
    ArrowRight: reader.next, ArrowLeft: reader.prev, PageDown: reader.next, PageUp: reader.prev, " ": reader.next,
    Home: reader.chapterStart, End: reader.chapterEnd,
    t: () => reader.togglePanel("toc"), n: () => reader.togglePanel("notes"), ",": () => reader.togglePanel("settings"),
    "]": reader.nextChapter, "[": reader.prevChapter, l: reader.toggleLayout, b: reader.bookmark, d: settings.toggleMode,
  };
  if (vim) {
    Object.assign(map, {
      l: reader.next, h: reader.prev, j: () => reader.scrollBy(60), k: () => reader.scrollBy(-60),
      G: reader.chapterEnd, g: reader.chapterStart,
    });
  }
  const action = map[e.key] ?? (e.shiftKey && e.key === " " ? reader.prev : null);
  if (e.shiftKey && e.key === " ") {
    reader.prev();
    return true;
  }
  if (!action) return false;
  action();
  return true;
}

async function boot() {
  const boot = await call("boot");
  state.config = boot.config;
  state.lite = boot.lite;
  document.body.classList.toggle("lite", state.lite);
  applyConfig();
  await loadLocale(state.config.reader.locale);
  translate();

  library.setOnOpen(openBook);
  library.init();
  reader.init();
  settings.init();
  palette.init();
  commands.set("open", { label: () => t("cmdOpen"), run: pickFiles, when: () => !state.lite, key: "O" });

  addEventListener("keydown", (e) => {
    if (onKey(e)) e.preventDefault();
  });
  $("#back").addEventListener("click", goHome);
  on("live-open", ({ payload }) => openPath(payload).catch(fail));
  $("#open-files").addEventListener("click", pickFiles);
  on("ui-changed", ({ payload }) => {
    if (payload.every((/** @type {string} */ p) => p.endsWith(".css"))) {
      for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
        const href = /** @type {HTMLLinkElement} */ (link).href.split("?")[0];
        /** @type {HTMLLinkElement} */ (link).href = `${href}?${Date.now()}`;
      }
      setTimeout(reader.relayoutKeepingPlace, 200);
    } else {
      location.reload();
    }
  });
  if (!state.lite) {
    window.__TAURI__.webview.getCurrentWebview().onDragDropEvent((/** @type {any} */ e) => {
      if (e.payload.type === "drop") addFiles(e.payload.paths).catch(fail);
    });
  }

  if (boot.initial) {
    await openPath(boot.initial).catch(fail);
  } else {
    show("home");
    await library.refresh();
  }
  requestAnimationFrame(() => call("ready"));
}

/** @type {any} */ (window).vibe = { goHome, openBook };
boot().catch(fail);
