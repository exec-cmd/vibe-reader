// The reading view: toolbar, side panel (contents, pages, notes, find), annotations, position.
// The page itself is drawn by an engine: FlowEngine for reflowable books, PdfEngine for PDF.

import * as atmosphere from "./atmosphere.js";
import { $, call, commands, debounce, escapeHtml, fail, isAgent, locator, on, parseLocator, state } from "./core.js";
import { FlowEngine } from "./flow.js";
import { t } from "./i18n.js";
import { PdfEngine } from "./pdfview.js";
import { icon, menu, paintIcons, toast } from "./ui.js";

/** @typedef {import("./core.js").Annotation} Annotation */
/** @typedef {{ book: import("./core.js").Book | null, title: string, authors: string[], language: string | null,
 *   kind: "prose" | "tech", format: string, toc: {title: string, chapter: number, level: number, anchor: string | null, offset: number}[],
 *   chapters: {title: string, chars: number}[], paths: string[], position: string | null,
 *   annotations: Annotation[], art: any[] }} Opened */

/** @type {Opened | null} */
let book = null;
/** @type {FlowEngine | PdfEngine | null} */
let engine = null;
let tab = "toc";
/** Set by app.js. @type {() => void} */
let goHome = () => {};
/** @type {(() => void) | null} */
let stopSearch = null;
/** Ranges per highlight name, rebuilt as pages are drawn. */
const marks = { user: new Map(), agent: new Map() };

const reader = () => $("#reader");
const viewport = () => $("#viewport");
const page = () => $("#page");
const isPdf = () => engine instanceof PdfEngine;

export const current = () => book;

// ---------- opening ----------

export async function open(/** @type {Opened} */ opened) {
  engine?.destroy();
  book = opened;
  marks.user.clear();
  marks.agent.clear();
  const at = parseLocator(opened.position);
  const pdf = opened.format === "pdf";
  reader().dataset.kind = pdf ? "pdf" : "flow";
  page().className = `page${pdf ? " pdf" : ""}`;
  page().replaceChildren();
  page().lang = opened.language || "";
  $("#reader-title").textContent = opened.title;
  $("#reader-sub").textContent = opened.authors.join(", ");
  $("#lite-bar").hidden = !state.lite;
  $("#lite-title").textContent = opened.title;
  $("#lite-add").hidden = !!opened.book;
  $("#back").hidden = state.lite;
  $("#zoom-tools").hidden = !pdf;
  /** @type {HTMLElement} */ ($('[data-tab="thumbs"]')).hidden = !pdf;
  if (tab === "thumbs" && !pdf) tab = "toc";

  if (pdf) {
    atmosphere.apply(await lookAt(locator(0, 0)));
    viewport().dataset.engine = "pdf";
    engine = new PdfEngine(page(), viewport(), {
      layout: state.config.pdf.layout,
      fit: state.config.pdf.fit,
      invert: invertPdf(),
      onPage: () => {
        updateChrome();
        savePosition();
      },
      onPaint: paintPdfPage,
    });
    await engine.open(at.chapter);
  } else {
    viewport().dataset.engine = "flow";
    const layout = state.config.reader.layout;
    engine = new FlowEngine({
      page: page(),
      frame: $("#frame"),
      viewport: viewport(),
      layout: layout === "spread" && opened.kind === "tech" ? "pages" : layout,
      onPage: () => {
        updateChrome();
        savePosition();
      },
      decorate: async (index, offset) => {
        insertArt(index);
        const look = await lookAt(locator(index, offset));
        atmosphere.apply(look);
        atmosphere.illustrate(page(), look);
      },
    });
    await engine.open(opened.chapters.length, at);
    paintFlow();
  }
  renderSide();
  updateChrome();
}

const invertPdf = () => state.config.pdf.invert_dark && (reader().dataset.mode || document.documentElement.dataset.mode) === "dark";

/** The atmosphere at a place; none for files outside the library and in lite mode. */
async function lookAt(/** @type {string} */ at) {
  if (!book?.book || state.lite) return null;
  const dark = document.documentElement.dataset.mode === "dark";
  return call("atmosphere", { at, dark }).catch(() => null);
}

/** Art attached to a chapter, inserted as UI elements so offsets stay intact. */
function insertArt(/** @type {number} */ chapter) {
  for (const art of book?.art ?? []) {
    const at = parseLocator(art.locator);
    if (at.chapter !== chapter || art.placement === "cover") continue;
    const figure = document.createElement("figure");
    figure.className = `art-${art.placement}`;
    figure.dataset.skip = "";
    figure.innerHTML = `<img alt="" src="/art/${encodeURIComponent(art.file)}">`;
    if (art.placement === "chapter") {
      page().prepend(figure);
      continue;
    }
    let anchor = null;
    for (const el of page().querySelectorAll("[data-o]")) {
      if (Number(/** @type {HTMLElement} */ (el).dataset.o) > at.offset) break;
      anchor = el;
    }
    while (anchor && anchor.parentElement !== page() && anchor.parentElement?.closest("#page")) anchor = anchor.parentElement;
    anchor ? anchor.before(figure) : page().append(figure);
  }
}

// ---------- navigation ----------

export async function next() {
  const before = engine instanceof FlowEngine ? engine.chapter : -1;
  await engine?.next();
  if (engine instanceof FlowEngine && engine.chapter !== before) paintFlow();
}

export async function prev() {
  const before = engine instanceof FlowEngine ? engine.chapter : -1;
  await engine?.prev();
  if (engine instanceof FlowEngine && engine.chapter !== before) paintFlow();
}

/** Goes to a place: chapter (or page) and offset. */
export async function goTo(/** @type {{chapter: number, offset: number}} */ at, /** @type {string | null} */ anchor = null) {
  if (!engine) return;
  if (engine instanceof PdfEngine) return engine.go(at.chapter);
  if (at.chapter !== engine.chapter || anchor) {
    await engine.load(at.chapter, { offset: at.offset, anchor });
    paintFlow();
  } else {
    engine.showOffset(at.offset);
  }
  updateChrome();
}

export async function nextChapter() {
  if (engine instanceof PdfEngine) return engine.go(engine.page + 10);
  if (engine && (await engine.load(engine.chapter + 1))) paintFlow();
}

export async function prevChapter() {
  if (engine instanceof PdfEngine) return engine.go(engine.page - 10);
  if (engine && (await engine.load(engine.chapter - 1))) paintFlow();
}

export const chapterStart = () => (engine instanceof PdfEngine ? engine.go(0) : engine?.goPage(0));
export const chapterEnd = () => (engine instanceof PdfEngine ? engine.go(engine.pages - 1) : engine?.goPage(engine.pages - 1));
export const scrollBy = (/** @type {number} */ dy) => viewport().scrollBy({ top: dy });

export function focusPageInput() {
  const input = /** @type {HTMLInputElement} */ ($("#page-input"));
  input.focus();
  input.select();
}

function position() {
  if (!engine) return { chapter: 0, offset: 0 };
  return engine instanceof PdfEngine ? { chapter: engine.page, offset: 0 } : engine.position();
}

const savePosition = debounce(async () => {
  if (!book || !engine || state.view !== "reader") return;
  const pos = position();
  const at = locator(pos.chapter, pos.offset);
  book.position = at;
  updateProgress();
  reportState();
  if (!book.book) return;
  await call("save_position", { locator: at }).catch(fail);
  // Scenes (range atmospheres) can change the look inside a chapter.
  if (!isPdf()) atmosphere.apply(await lookAt(at));
}, 500);

function reportState() {
  const sel = engine?.selection();
  const selection = sel ? { start: locator(sel.chapter, sel.start), end: locator(sel.chapter, sel.end), text: sel.text } : null;
  call("report_state", { live: { position: book?.position ?? null, selection } }).catch(() => {});
}

function updateProgress() {
  if (!book || !engine) return;
  let share;
  if (engine instanceof PdfEngine) share = engine.pages > 1 ? engine.page / (engine.pages - 1) : 1;
  else {
    const total = book.chapters.reduce((s, c) => s + c.chars, 0) || 1;
    const before = book.chapters.slice(0, engine.chapter).reduce((s, c) => s + c.chars, 0);
    share = (before + parseLocator(book.position).offset) / total;
  }
  $("#progress").style.width = `${Math.min(100, share * 100)}%`;
}

function updateChrome() {
  if (!book || !engine) return;
  const input = /** @type {HTMLInputElement} */ ($("#page-input"));
  if (document.activeElement !== input) input.value = engine.label();
  if (engine instanceof PdfEngine) {
    $("#page-total").textContent = `/ ${engine.pages}`;
    $("#zoom-level .select-value").textContent = typeof engine.fit === "number" ? `${engine.fit}%` : engine.fit === "width" ? t("fitWidth") : t("fitPage");
  } else {
    $("#page-total").textContent = engine.total() ? `/ ${engine.total()}` : "";
    $("#reader-sub").textContent = book.chapters[engine.chapter]?.title || t("chapterN", { n: engine.chapter + 1 });
  }
  /** @type {HTMLElement} */ ($(".pager")).hidden = engine instanceof FlowEngine && engine.layout === "scroll";
  $("#layout-btn").innerHTML = icon(engine.layout === "scroll" ? "scroll" : engine.layout === "spread" ? "pages" : "page");
  $("#mode-btn").innerHTML = icon(document.documentElement.dataset.mode === "dark" ? "sun" : "moon");
  const here = engine instanceof PdfEngine ? engine.page : engine.chapter;
  for (const el of document.querySelectorAll("#side-body [data-chapter]")) {
    el.classList.toggle("current", Number(/** @type {HTMLElement} */ (el).dataset.chapter) === here);
  }
  updateProgress();
}

// ---------- layout, zoom, look ----------

const FLOW_LAYOUTS = ["spread", "pages", "scroll"];
const PDF_LAYOUTS = ["spread", "single", "scroll"];

export async function setLayout(/** @type {string} */ layout) {
  if (!engine) return;
  if (engine instanceof PdfEngine) await engine.setLayout(layout);
  else {
    engine.setLayout(layout);
    paintFlow();
  }
  updateChrome();
}

export function cycleLayout() {
  if (!engine) return;
  const list = isPdf() ? PDF_LAYOUTS : FLOW_LAYOUTS;
  setLayout(list[(list.indexOf(engine.layout) + 1) % list.length]);
}

function layoutMenu() {
  const list = isPdf() ? PDF_LAYOUTS : FLOW_LAYOUTS;
  const icons = { spread: "pages", pages: "page", single: "page", scroll: "scroll" };
  menu($("#layout-btn"), list.map((l) => ({ label: t(`layout_${l}`), icon: icons[l], checked: engine?.layout === l, run: () => setLayout(l) })), { align: "end" });
}

export async function zoom(/** @type {number | "page" | "width" | "in" | "out" | "reset"} */ how) {
  if (!(engine instanceof PdfEngine)) {
    // Reflowable text zooms by font size.
    const ty = state.config.typography;
    ty.size = how === "in" ? Math.min(30, ty.size + 1) : how === "out" ? Math.max(12, ty.size - 1) : 19;
    /** @type {any} */ (window).vibe.applyTypography();
    return;
  }
  if (how === "in") await engine.zoomBy(1);
  else if (how === "out") await engine.zoomBy(-1);
  else await engine.setZoom(how === "reset" ? "page" : how);
  updateChrome();
}

function zoomMenu() {
  if (!(engine instanceof PdfEngine)) return;
  const pdf = engine;
  menu($("#zoom-level"), [
    { label: t("fitPage"), icon: "fitPage", checked: pdf.fit === "page", run: () => zoom("page") },
    { label: t("fitWidth"), icon: "fitWidth", checked: pdf.fit === "width", run: () => zoom("width") },
    { separator: true },
    ...[50, 75, 100, 125, 150, 200, 300].map((z) => ({ label: `${z}%`, checked: pdf.fit === z, run: () => zoom(z) })),
  ]);
}

async function lookMenu() {
  if (!book?.book) return toast(t("lookNeedsLibrary"));
  const id = book.book.id;
  const presets = await call("presets").catch(() => []);
  const currentPreset = await call("book_preset", { id }).catch(() => null);
  const choose = async (/** @type {string | null} */ preset) => {
    await call("set_book_preset", { id, preset }).catch(fail);
    atmosphere.apply(await lookAt(book.position ?? "ch:1:0"));
    if (engine instanceof PdfEngine) engine.invert(invertPdf());
    updateChrome();
  };
  menu($("#look-btn"), [
    { label: t("defaultPreset"), checked: !currentPreset, run: () => choose(null) },
    { separator: true },
    ...presets.map((p) => ({ label: p.name, hint: p.modes.length === 1 ? t(p.modes[0] === "dark" ? "modeDark" : "modeLight") : "", checked: currentPreset === p.id, run: () => choose(p.id) })),
    { separator: true },
    { label: t("particles"), checked: state.config.reader.particles, run: async () => {
      state.config.reader.particles = !state.config.reader.particles;
      /** @type {any} */ (window).vibe.saveConfig();
      atmosphere.reset();
      atmosphere.apply(await lookAt(book.position ?? "ch:1:0"));
    } },
  ], { align: "end" });
}

export async function onModeChange() {
  if (book) atmosphere.apply(await lookAt(book.position ?? "ch:1:0"));
  if (engine instanceof PdfEngine) engine.invert(invertPdf());
  updateChrome();
}

export async function toggleFullscreen() {
  try {
    const w = window.__TAURI__.window.getCurrentWindow();
    const on = !(await w.isFullscreen());
    await w.setFullscreen(on);
    document.body.dataset.fullscreen = on ? "1" : "0";
    setTimeout(relayoutKeepingPlace, 250);
  } catch (e) {
    fail(e);
  }
}

function moreMenu() {
  menu($("#reader-more"), [
    { label: t("cmdBookmark"), icon: "bookmark", hint: "B", disabled: !book?.book, run: bookmark },
    { label: t("goToPage"), icon: "chevronRight", hint: "G", run: focusPageInput },
    { label: t("findInBook"), icon: "search", hint: "Ctrl+F", run: () => showTab("search") },
    { separator: true },
    { label: t("readingSettings"), icon: "gear", run: () => /** @type {any} */ (window).vibe.openSettings(isPdf() ? "pdf" : "reading") },
  ], { align: "end" });
}

// ---------- annotations ----------

function chapterNotes(/** @type {number} */ chapter) {
  return (book?.annotations ?? []).filter((a) => parseLocator(a.start).chapter === chapter && a.kind !== "bookmark");
}

/** Repaints highlights and marks of the current chapter (flow books). */
function paintFlow() {
  if (!(engine instanceof FlowEngine)) return;
  for (const el of page().querySelectorAll(".mark")) el.remove();
  marks.user.clear();
  marks.agent.clear();
  const pr = page().getBoundingClientRect();
  for (const a of chapterNotes(engine.chapter)) {
    const start = parseLocator(a.start).offset;
    const endLoc = parseLocator(a.end);
    const end = endLoc.chapter === engine.chapter ? endLoc.offset : start + 1;
    const range = engine.range(engine.chapter, start, Math.max(end, start + 1));
    if (!range) continue;
    if (end > start) marks[isAgent(a.author) ? "agent" : "user"].set(a.id, range);
    const rect = range.getClientRects()[0];
    if (!a.body || !rect) continue;
    const mark = noteMark(a, rect);
    mark.style.left = `${engine.columnLeft(rect)}px`;
    mark.style.top = `${rect.top - pr.top + 3}px`;
    page().append(mark);
  }
  applyHighlights();
}

/** Paints a PDF page once pdf.js has drawn its text layer. */
function paintPdfPage(/** @type {number} */ pageIndex, /** @type {HTMLElement} */ layer) {
  if (!(engine instanceof PdfEngine)) return;
  const pdf = engine;
  const holder = /** @type {HTMLElement} */ (layer.parentElement);
  const text = pdf.texts.get(pageIndex) ?? "";
  for (const a of chapterNotes(pageIndex)) {
    let start = parseLocator(a.start).offset;
    let end = parseLocator(a.end).offset;
    // Notes written by agents count offsets in another extraction of the text; find them by quote.
    const quote = a.quote.replace(/\s+/g, " ").trim().slice(0, 30);
    if (quote && ![...text].slice(start, start + quote.length).join("").startsWith(quote.slice(0, 10))) {
      const at = text.indexOf(quote);
      if (at >= 0) {
        const moved = [...text.slice(0, at)].length;
        end = moved + Math.max(1, end - start);
        start = moved;
      }
    }
    const range = pdf.range(pageIndex, start, Math.max(end, start + 1));
    if (!range) continue;
    if (end > start) marks[isAgent(a.author) ? "agent" : "user"].set(a.id, range);
    const rect = range.getClientRects()[0];
    if (!a.body || !rect) continue;
    const hr = holder.getBoundingClientRect();
    const mark = noteMark(a, rect);
    mark.style.left = "-26px";
    mark.style.top = `${rect.top - hr.top}px`;
    holder.append(mark);
  }
  applyHighlights();
}

function noteMark(/** @type {Annotation} */ a, /** @type {DOMRect} */ rect) {
  const mark = document.createElement("button");
  mark.className = `mark ${isAgent(a.author) ? "agent" : ""}`;
  mark.dataset.skip = "";
  mark.innerHTML = icon(isAgent(a.author) ? "agent" : "notes", 12);
  mark.title = a.body;
  mark.addEventListener("click", (e) => {
    e.stopPropagation();
    openNote(a, rect);
  });
  return mark;
}

function applyHighlights() {
  if (!("highlights" in CSS)) return;
  CSS.highlights.set("user", new Highlight(...marks.user.values()));
  CSS.highlights.set("agent", new Highlight(...marks.agent.values()));
}

function repaint() {
  if (engine instanceof PdfEngine) {
    marks.user.clear();
    marks.agent.clear();
    for (const holder of page().querySelectorAll(".pdf-page")) {
      holder.querySelectorAll(".mark").forEach((m) => m.remove());
      const layer = holder.querySelector(".textLayer");
      if (layer) paintPdfPage(Number(/** @type {HTMLElement} */ (holder).dataset.page), /** @type {HTMLElement} */ (layer));
    }
  } else paintFlow();
  renderSide();
}

function showSelbar() {
  const sel = engine?.selection();
  const bar = $("#selbar");
  if (!sel) return void (bar.hidden = true);
  const rr = reader().getBoundingClientRect();
  bar.style.left = `${sel.rect.left + sel.rect.width / 2 - rr.left}px`;
  bar.style.top = `${sel.rect.top - rr.top - 8}px`;
  for (const b of bar.querySelectorAll('[data-act="highlight"], [data-act="note"]')) /** @type {HTMLButtonElement} */ (b).disabled = !book?.book;
  bar.hidden = false;
}

async function annotate(/** @type {"note" | "highlight" | "bookmark"} */ kind, chapter, start, end, body = "", quote = null) {
  const a = await call("annotate", { kind, start: locator(chapter, start), end: locator(chapter, end), body, quote });
  book.annotations.push(a);
  repaint();
  return a;
}

function openNote(/** @type {Annotation | null} */ a, /** @type {DOMRect} */ rect, fresh = null) {
  const pop = $("#notepop");
  const rr = reader().getBoundingClientRect();
  const own = !a || !isAgent(a.author);
  pop.innerHTML = `
    <div class="by">${a && isAgent(a.author) ? `${icon("agent", 13)} ${escapeHtml(t("agent", { name: a.author }))}` : escapeHtml(t("you"))}</div>
    <blockquote class="q"></blockquote>
    ${own ? `<textarea class="textarea"></textarea>` : `<div class="b"></div>`}
    <div class="row">
      ${a && own ? `<button class="btn quiet danger" data-act="delete">${icon("trash", 15)}${t("delete")}</button>` : ""}
      <span class="grow"></span>
      <button class="btn" data-act="cancel">${t(own ? "cancel" : "close")}</button>
      ${own ? `<button class="btn primary" data-act="save">${t("save")}</button>` : ""}
    </div>`;
  pop.querySelector(".q").textContent = a ? a.quote : fresh.text;
  const area = /** @type {HTMLTextAreaElement | null} */ (pop.querySelector("textarea"));
  if (area) {
    area.value = a?.body ?? "";
    area.placeholder = t("notePlaceholder");
  } else pop.querySelector(".b").textContent = a.body;
  pop.style.left = `${Math.min(Math.max(rect.left + rect.width / 2 - rr.left, 230), rr.width - 230)}px`;
  pop.style.top = `${Math.max(56, Math.min(rect.bottom - rr.top + 10, rr.height - 280))}px`;
  pop.hidden = false;
  area?.focus();
  const close = () => (pop.hidden = true);
  pop.querySelector('[data-act="cancel"]').addEventListener("click", close);
  pop.querySelector('[data-act="delete"]')?.addEventListener("click", async () => {
    await call("delete_annotation", { id: a.id }).catch(fail);
    book.annotations = book.annotations.filter((x) => x.id !== a.id);
    repaint();
    close();
  });
  pop.querySelector('[data-act="save"]')?.addEventListener("click", async () => {
    const body = area.value.trim();
    try {
      if (a) {
        const edited = await call("edit_annotation", { id: a.id, body });
        book.annotations = book.annotations.map((x) => (x.id === a.id ? edited : x));
        repaint();
      } else if (fresh) {
        await annotate("note", fresh.chapter, fresh.start, fresh.end, body, isPdf() ? fresh.text : null);
      }
    } catch (e) {
      fail(e);
    }
    close();
  });
  area?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) /** @type {HTMLElement} */ (pop.querySelector('[data-act="save"]')).click();
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });
}

export async function bookmark() {
  if (!book?.book || !engine) return;
  const pos = position();
  await annotate("bookmark", pos.chapter, pos.offset, pos.offset, "", isPdf() ? t("pageN", { n: pos.chapter + 1 }) : null).catch(fail);
  toast(t("bookmarked"));
}

// ---------- side panel ----------

export function toggleSide(/** @type {string} */ to = tab) {
  const side = $("#side");
  if (!side.hidden && to === tab) side.hidden = true;
  else {
    tab = to;
    side.hidden = false;
    renderSide();
  }
  $("#toggle-side").setAttribute("aria-pressed", String(!side.hidden));
  setTimeout(relayoutKeepingPlace, 20);
}

export function showTab(/** @type {string} */ to) {
  tab = to;
  if ($("#side").hidden) toggleSide(to);
  else renderSide();
  if (to === "search") setTimeout(() => /** @type {HTMLElement | null} */ ($("#find-input"))?.focus(), 30);
}

function renderSide() {
  if (!book || $("#side").hidden) return;
  for (const b of $("#side-tabs").children) b.setAttribute("aria-selected", String(/** @type {HTMLElement} */ (b).dataset.tab === tab));
  const body = $("#side-body");
  body.replaceChildren();
  ({ toc: renderToc, thumbs: renderThumbs, notes: renderNotes, search: renderFind })[tab]?.(body);
}

async function renderToc(/** @type {HTMLElement} */ body) {
  const list = document.createElement("div");
  list.className = "toc-list";
  body.append(list);
  const item = (title, level, chapter, go) => {
    const a = document.createElement("button");
    a.className = "toc-item";
    a.style.paddingLeft = `${10 + level * 14}px`;
    a.dataset.chapter = String(chapter);
    a.innerHTML = `<span class="name"></span>${engine instanceof PdfEngine ? `<span class="pg">${chapter + 1}</span>` : ""}`;
    a.querySelector(".name").textContent = title;
    a.addEventListener("click", go);
    list.append(a);
  };
  if (engine instanceof PdfEngine) {
    const pdf = engine;
    const outline = await pdf.outline().catch(() => []);
    if (!outline.length) list.innerHTML = `<p class="side-empty">${escapeHtml(t("noOutline"))}</p>`;
    for (const o of outline) item(o.title, o.level, o.page ?? 0, () => o.page !== null && pdf.go(o.page));
  } else {
    for (const e of book.toc) item(e.title || t("chapterN", { n: e.chapter + 1 }), e.level, e.chapter, () => goTo({ chapter: e.chapter, offset: e.offset }, e.anchor));
  }
  updateChrome();
  list.querySelector(".current")?.scrollIntoView({ block: "center" });
}

function renderThumbs(/** @type {HTMLElement} */ body) {
  if (!(engine instanceof PdfEngine)) return;
  const pdf = engine;
  const grid = document.createElement("div");
  grid.className = "thumbs";
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = /** @type {HTMLElement} */ (e.target);
      observer.unobserve(el);
      pdf.thumb(Number(el.dataset.chapter), el.querySelector("canvas"));
    }
  }, { root: body, rootMargin: "400px 0px" });
  for (let i = 0; i < pdf.pages; i++) {
    const cell = document.createElement("button");
    cell.className = "thumb";
    cell.dataset.chapter = String(i);
    cell.innerHTML = `<canvas></canvas><span>${i + 1}</span>`;
    cell.addEventListener("click", () => pdf.go(i));
    grid.append(cell);
    observer.observe(cell);
  }
  body.append(grid);
  updateChrome();
  grid.querySelector(".current")?.scrollIntoView({ block: "center" });
}

function renderNotes(/** @type {HTMLElement} */ body) {
  const items = [...book.annotations].sort((a, b) => {
    const x = parseLocator(a.start), y = parseLocator(b.start);
    return x.chapter - y.chapter || x.offset - y.offset;
  });
  if (!items.length) {
    body.innerHTML = `<p class="side-empty">${escapeHtml(book.book ? t("noNotes") : t("notesNeedLibrary"))}</p>`;
    return;
  }
  for (const a of items) {
    const at = parseLocator(a.start);
    const where = isPdf() ? t("pageN", { n: at.chapter + 1 }) : book.chapters[at.chapter]?.title || t("chapterN", { n: at.chapter + 1 });
    const el = document.createElement("div");
    el.className = `note-item ${isAgent(a.author) ? "agent" : ""}`;
    el.innerHTML = `<div class="note-head">${icon(a.kind === "bookmark" ? "bookmark" : a.kind === "highlight" ? "marker" : "notes", 14)}<span class="where"></span><span class="who"></span></div>
      ${a.quote && a.kind !== "bookmark" ? `<div class="q"></div>` : ""}${a.body ? `<div class="b"></div>` : ""}`;
    el.querySelector(".where").textContent = where;
    el.querySelector(".who").textContent = isAgent(a.author) ? a.author : "";
    el.querySelector(".q") && (el.querySelector(".q").textContent = a.quote.slice(0, 220));
    el.querySelector(".b") && (el.querySelector(".b").textContent = a.body);
    el.addEventListener("click", () => goTo(at));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      menu({ x: e.clientX, y: e.clientY }, [
        { label: t("goThere"), icon: "chevronRight", run: () => goTo(at) },
        { label: t("delete"), icon: "trash", danger: true, disabled: isAgent(a.author), run: async () => {
          await call("delete_annotation", { id: a.id }).catch(fail);
          book.annotations = book.annotations.filter((x) => x.id !== a.id);
          repaint();
        } },
      ]);
    });
    body.append(el);
  }
}

let lastQuery = "";
function renderFind(/** @type {HTMLElement} */ body) {
  body.innerHTML = `<label class="find-box">${icon("search", 16)}<input id="find-input" type="search" autocomplete="off"></label>
    <div class="find-status"></div><div class="find-results"></div>`;
  const input = /** @type {HTMLInputElement} */ (body.querySelector("input"));
  input.placeholder = t("findPlaceholder");
  input.value = lastQuery;
  const status = body.querySelector(".find-status");
  const results = body.querySelector(".find-results");
  const run = debounce(async () => {
    stopSearch?.();
    results.replaceChildren();
    const q = (lastQuery = input.value.trim());
    if (q.length < 2) return void (status.textContent = "");
    let count = 0;
    const add = (/** @type {{chapter: number, offset: number, length?: number, snippet: string}[]} */ hits) => {
      for (const h of hits.slice(0, Math.max(0, 500 - count))) {
        const b = document.createElement("button");
        b.className = "find-hit";
        b.innerHTML = `<span class="where"></span><span class="snip"></span>`;
        b.querySelector(".where").textContent = isPdf() ? t("pageN", { n: h.chapter + 1 }) : book.chapters[h.chapter]?.title || t("chapterN", { n: h.chapter + 1 });
        b.querySelector(".snip").innerHTML = markSnippet(h.snippet, q);
        b.addEventListener("click", () => reveal(h.chapter, h.offset, h.length ?? [...q].length));
        results.append(b);
      }
      count += hits.length;
    };
    status.textContent = t("searching");
    if (engine instanceof PdfEngine) {
      stopSearch = engine.search(q, (hits, done) => {
        add(hits);
        status.textContent = done ? t("foundN", { n: count }) : `${t("searching")} ${t("foundN", { n: count })}`;
      });
    } else {
      const hits = await call("search_book", { query: q }).catch(() => []);
      add(hits.map((h) => ({ ...parseLocator(h.locator), snippet: h.snippet })));
      status.textContent = t("foundN", { n: count });
    }
  }, 250);
  input.addEventListener("input", run);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") /** @type {HTMLElement | null} */ (results.firstElementChild)?.click();
    e.stopPropagation();
  });
  if (lastQuery) run();
}

function markSnippet(/** @type {string} */ text, /** @type {string} */ q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, i))}<mark>${escapeHtml(text.slice(i, i + q.length))}</mark>${escapeHtml(text.slice(i + q.length))}`;
}

/** Shows a found passage and marks it for a few seconds. */
async function reveal(/** @type {number} */ chapter, /** @type {number} */ offset, /** @type {number} */ length) {
  await goTo({ chapter, offset });
  const mark = () => {
    const range = engine?.range(chapter, offset, offset + length);
    if (!range) return false;
    if ("highlights" in CSS) CSS.highlights.set("found", new Highlight(range));
    const rect = range.getBoundingClientRect();
    const vr = viewport().getBoundingClientRect();
    if (rect.top < vr.top || rect.bottom > vr.bottom) viewport().scrollBy({ top: rect.top - vr.top - vr.height / 3, behavior: "smooth" });
    return true;
  };
  // A PDF page draws its text layer asynchronously.
  for (let i = 0; i < 30 && !mark(); i++) await new Promise((r) => setTimeout(r, 100));
  setTimeout(() => CSS.highlights?.delete("found"), 6000);
}

/** Follows links inside the book; external links are only shown. */
function onLink(/** @type {MouseEvent} */ e) {
  const a = /** @type {HTMLAnchorElement | null} */ (/** @type {Element} */ (e.target).closest("a[href]"));
  if (!a || !book || !(engine instanceof FlowEngine)) return;
  e.preventDefault();
  const href = a.getAttribute("href");
  if (href.startsWith("#")) {
    const target = page().querySelector(`#${CSS.escape(decodeURIComponent(href.slice(1)))}`);
    if (target) engine.showElement(target);
  } else if (href.startsWith("/res/")) {
    const [path, anchor] = decodeURIComponent(href.slice(5)).split("#");
    const index = book.paths.indexOf(path);
    if (index >= 0) goTo({ chapter: index, offset: 0 }, anchor || null);
  } else {
    toast(href);
  }
}

export function relayoutKeepingPlace() {
  if (!book || !engine || state.view !== "reader") return;
  if (engine instanceof PdfEngine) engine.render();
  else {
    engine.relayoutKeepingPlace();
    paintFlow();
  }
  updateChrome();
}

export function closeOverlays() {
  const pop = $("#notepop");
  if (!pop.hidden || !$("#selbar").hidden) {
    pop.hidden = true;
    $("#selbar").hidden = true;
    return true;
  }
  return false;
}

export function init(/** @type {{ goHome: () => void }} */ hooks) {
  goHome = hooks.goHome;
  page().addEventListener("click", onLink);
  viewport().addEventListener("mouseup", () => setTimeout(showSelbar, 0));
  viewport().addEventListener("scroll", () => {
    $("#selbar").hidden = true;
    if (engine instanceof FlowEngine && engine.layout === "scroll") savePosition();
  });
  // Ctrl + wheel zooms.
  viewport().addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoom(e.deltaY < 0 ? "in" : "out");
  }, { passive: false });
  $("#selbar").addEventListener("mousedown", (e) => e.preventDefault());
  $("#selbar").addEventListener("click", async (e) => {
    const act = /** @type {HTMLElement} */ (/** @type {Element} */ (e.target).closest("[data-act]"))?.dataset.act;
    const sel = engine?.selection();
    $("#selbar").hidden = true;
    if (!sel) return;
    if (act === "copy") navigator.clipboard.writeText(getSelection().toString()).then(() => toast(t("copied")));
    if (act === "highlight") await annotate("highlight", sel.chapter, sel.start, sel.end, "", isPdf() ? sel.text : null).catch(fail);
    if (act === "note") openNote(null, sel.rect, sel);
    if (act === "find") {
      lastQuery = getSelection().toString().trim().slice(0, 80);
      showTab("search");
    }
    if (act !== "note") getSelection()?.removeAllRanges();
  });
  for (const b of $("#side-tabs").children) b.addEventListener("click", () => showTab(/** @type {HTMLElement} */ (b).dataset.tab));
  $("#toggle-side").addEventListener("click", () => toggleSide());
  $("#back").addEventListener("click", () => goHome());
  $("#prev-page").addEventListener("click", prev);
  $("#next-page").addEventListener("click", next);
  const pageInput = /** @type {HTMLInputElement} */ ($("#page-input"));
  pageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const n = parseInt(pageInput.value, 10);
      if (n > 0 && engine) engine instanceof PdfEngine ? engine.go(n - 1) : engine.goPage(n - 1);
      pageInput.blur();
    }
    if (e.key === "Escape") pageInput.blur();
    e.stopPropagation();
  });
  pageInput.addEventListener("focus", () => pageInput.select());
  pageInput.addEventListener("blur", updateChrome);
  $("#zoom-in").addEventListener("click", () => zoom("in"));
  $("#zoom-out").addEventListener("click", () => zoom("out"));
  $("#zoom-level").addEventListener("click", zoomMenu);
  $("#layout-btn").addEventListener("click", layoutMenu);
  $("#search-btn").addEventListener("click", () => showTab("search"));
  $("#look-btn").addEventListener("click", lookMenu);
  $("#mode-btn").addEventListener("click", () => /** @type {any} */ (window).vibe.toggleMode());
  $("#fullscreen-btn").addEventListener("click", toggleFullscreen);
  $("#reader-more").addEventListener("click", moreMenu);
  $("#lite-add").addEventListener("click", async () => {
    try {
      book.book = await call("import_open");
      $("#lite-add").hidden = true;
      toast(t("added"));
    } catch (e) {
      fail(e);
    }
  });
  addEventListener("resize", debounce(relayoutKeepingPlace, 150));
  document.fonts?.addEventListener?.("loadingdone", () => engine instanceof FlowEngine && relayoutKeepingPlace());
  document.addEventListener("selectionchange", debounce(() => book && reportState(), 300));
  on("live-goto", ({ payload }) => goTo(parseLocator(payload)));
  on("live-highlight", ({ payload }) => {
    const s = parseLocator(payload.start), e = parseLocator(payload.end);
    reveal(s.chapter, s.offset, e.chapter === s.chapter ? Math.max(1, e.offset - s.offset) : 200);
  });
  on("live-reload", async () => {
    const fresh = await call("refresh_open").catch(() => null);
    if (!fresh || !book) return;
    book.annotations = fresh.annotations;
    book.art = fresh.art;
    if (engine instanceof FlowEngine) await engine.load(engine.chapter, { offset: engine.visibleOffset() });
    else atmosphere.apply(await lookAt(book.position ?? "ch:1:0"));
    repaint();
  });
  on("book-changed", async () => {
    if (!(engine instanceof FlowEngine)) return;
    await engine.load(Math.min(engine.chapter, book.chapters.length - 1), { offset: engine.visibleOffset() });
    paintFlow();
    toast(t("reloaded"));
  });
  paintIcons(reader());

  const inReader = () => state.view === "reader" && !!book;
  commands.set("side", { label: () => t("sidePanel"), run: () => toggleSide(), when: inReader, key: "T" });
  commands.set("find", { label: () => t("findInBook"), run: () => showTab("search"), when: inReader, key: "Ctrl+F" });
  commands.set("notes", { label: () => t("notes"), run: () => showTab("notes"), when: inReader, key: "N" });
  commands.set("next-chapter", { label: () => t("cmdNextChapter"), run: nextChapter, when: inReader, key: "]" });
  commands.set("prev-chapter", { label: () => t("cmdPrevChapter"), run: prevChapter, when: inReader, key: "[" });
  commands.set("layout", { label: () => t("cmdLayout"), run: cycleLayout, when: inReader, key: "L" });
  commands.set("bookmark", { label: () => t("cmdBookmark"), run: bookmark, when: () => inReader() && !!book.book, key: "B" });
  commands.set("goto", { label: () => t("goToPage"), run: focusPageInput, when: inReader, key: "G" });
  commands.set("fullscreen", { label: () => t("fullscreen"), run: toggleFullscreen, when: inReader, key: "F11" });
  commands.set("zoom-in", { label: () => t("zoomIn"), run: () => zoom("in"), when: inReader, key: "+" });
  commands.set("zoom-out", { label: () => t("zoomOut"), run: () => zoom("out"), when: inReader, key: "−" });
}
