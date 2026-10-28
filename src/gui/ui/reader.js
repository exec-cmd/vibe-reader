// The reading view: chapters, pages or scroll, position, annotations, panels.

import * as atmosphere from "./atmosphere.js";
import { $, calm, call, commands, debounce, escapeHtml, fail, isAgent, locator, on, parseLocator, state, toast } from "./core.js";
import { enhance } from "./enhance.js";
import { t } from "./i18n.js";
import { offsetOf, rangeOf } from "./offsets.js";

/** @typedef {import("./core.js").Annotation} Annotation */
/** @typedef {{ book: import("./core.js").Book | null, title: string, authors: string[], language: string | null,
 *   kind: "prose" | "tech", format: string, toc: {title: string, chapter: number, level: number, anchor: string | null}[],
 *   chapters: {title: string, chars: number}[], paths: string[], position: string | null,
 *   annotations: Annotation[], art: object[] }} Opened */

/** @type {Opened | null} */
let book = null;
let chapter = 0;
let pageIndex = 0;
let pages = 1;
let step = 1;
let columnWidth = 0;
/** @type {"pages" | "scroll"} */
let layout = "pages";
/** Set while the page is being rebuilt, so scroll events do not save a bogus position. */
let busy = false;

const reader = () => $("#reader");
const viewport = () => $("#viewport");
const page = () => $("#page");
const GAP = 64;

export const current = () => book;

/** Opens a book returned by `open_book` or `open_path`. */
export async function open(/** @type {Opened} */ opened) {
  book = opened;
  layout = opened.kind === "tech" ? "scroll" : "pages";
  reader().dataset.layout = layout;
  page().lang = opened.language || "";
  $("#reader-title").textContent = [opened.title, opened.authors[0]].filter(Boolean).join(" · ");
  $("#lite-bar").hidden = !state.lite;
  $("#lite-title").textContent = opened.title;
  $("#lite-add").hidden = !!opened.book;
  renderToc();
  renderNotes();
  const at = parseLocator(opened.position);
  chapter = -1;
  await loadChapter(Math.min(at.chapter, opened.chapters.length - 1), { offset: at.offset, initial: true });
}

/** The atmosphere at a place; none for files outside the library and in lite mode. */
async function lookAt(/** @type {string} */ at) {
  if (!book?.book || state.lite) return null;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  return call("atmosphere", { at, dark }).catch(() => null);
}

/** Shows the chapter title for a moment while the page changes. */
function splash(/** @type {string} */ title) {
  const el = $("#splash");
  el.textContent = title;
  el.classList.add("on");
  setTimeout(() => el.classList.remove("on"), 650);
  return new Promise((r) => setTimeout(r, 260));
}

/** Art attached to this chapter, inserted as UI elements so offsets stay intact. */
function insertArt() {
  for (const art of /** @type {any[]} */ (book?.art ?? [])) {
    const at = parseLocator(art.locator);
    if (at.chapter !== chapter || art.placement === "cover") continue;
    const figure = document.createElement("figure");
    figure.className = `art-${art.placement}`;
    figure.dataset.skip = "";
    const img = document.createElement("img");
    img.src = `/art/${encodeURIComponent(art.file)}`;
    img.alt = "";
    figure.append(img);
    if (art.placement === "chapter") {
      page().prepend(figure);
      continue;
    }
    let anchor = null;
    for (const el of page().querySelectorAll("[data-o]")) {
      if (Number(/** @type {HTMLElement} */ (el).dataset.o) > at.offset) break;
      anchor = el;
    }
    // Insert next to a top-level block so the figure never splits a paragraph.
    while (anchor && anchor.parentElement !== page() && anchor.parentElement?.closest("#page")) anchor = anchor.parentElement;
    anchor ? anchor.before(figure) : page().append(figure);
  }
}

/** @param {number} index @param {{offset?: number, atEnd?: boolean, anchor?: string | null, initial?: boolean}} [where] */
async function loadChapter(index, where = {}) {
  if (!book || index < 0 || index >= book.chapters.length) return;
  busy = true;
  const changed = index !== chapter;
  const [view, look] = await Promise.all([call("chapter", { index }), lookAt(locator(index, where.offset ?? 0))]);
  if (changed && !where.initial && !calm()) await splash(view.title);
  chapter = index;
  page().style.transform = "";
  page().innerHTML = view.html;
  enhance(page());
  insertArt();
  atmosphere.apply(look);
  atmosphere.illustrate(page(), look);
  relayout();
  paintAnnotations();
  if (where.anchor) {
    const target = page().querySelector(`#${CSS.escape(where.anchor)}`);
    if (target) showElement(target);
  } else if (where.atEnd) {
    goPage(pages - 1, false);
  } else if (where.offset) {
    showOffset(where.offset);
  } else {
    goPage(0, false);
    viewport().scrollTop = 0;
  }
  renderToc();
  updateChrome();
  busy = false;
  savePosition();
}

/** Recomputes columns for the page layout; scroll layout needs nothing. */
function relayout() {
  const p = page();
  const frame = $("#frame");
  if (layout === "scroll") {
    p.style.cssText = "";
    frame.style.width = "";
    pages = 1;
    return;
  }
  const vp = viewport();
  const style = getComputedStyle(p);
  const em = parseFloat(style.fontSize);
  const measure = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--measure")) * em || 34 * em;
  const available = vp.clientWidth - 56 - 2 * Math.max(16, vp.clientWidth * 0.04);
  const spread = book?.kind === "prose" && available >= 2 * measure * 0.85 + GAP;
  columnWidth = spread ? (Math.min(available, 2 * measure + GAP) - GAP) / 2 : Math.min(measure, available);
  const width = spread ? 2 * columnWidth + GAP : columnWidth;
  p.style.width = `${width}px`;
  frame.style.width = `${width + 56}px`;
  p.style.columnWidth = `${columnWidth}px`;
  p.style.columnGap = `${GAP}px`;
  step = width + GAP;
  pages = Math.max(1, Math.round((p.scrollWidth + GAP) / step));
}

function goPage(/** @type {number} */ n, save = true) {
  if (layout !== "pages") return;
  pageIndex = Math.max(0, Math.min(pages - 1, n));
  page().style.transform = `translateX(${-pageIndex * step}px)`;
  updateChrome();
  if (save) savePosition();
}

export async function next() {
  if (layout === "pages" && pageIndex < pages - 1) return goPage(pageIndex + 1);
  if (layout === "scroll") {
    const vp = viewport();
    if (vp.scrollTop + vp.clientHeight < vp.scrollHeight - 4) return vp.scrollBy({ top: vp.clientHeight * 0.9, behavior: "smooth" });
  }
  await loadChapter(chapter + 1);
}

export async function prev() {
  if (layout === "pages" && pageIndex > 0) return goPage(pageIndex - 1);
  if (layout === "scroll" && viewport().scrollTop > 0) return viewport().scrollBy({ top: -viewport().clientHeight * 0.9, behavior: "smooth" });
  await loadChapter(chapter - 1, { atEnd: true });
}

export const nextChapter = () => loadChapter(chapter + 1);
export const prevChapter = () => loadChapter(chapter - 1);
export const chapterStart = () => (layout === "pages" ? goPage(0) : viewport().scrollTo({ top: 0 }));
export const chapterEnd = () => (layout === "pages" ? goPage(pages - 1) : viewport().scrollTo({ top: viewport().scrollHeight }));
export const scrollBy = (/** @type {number} */ dy) => viewport().scrollBy({ top: dy });

/** Brings a chapter offset into view. */
function showOffset(/** @type {number} */ offset) {
  const range = rangeOf(page(), offset, offset + 1);
  if (!range) return;
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  if (layout === "pages") {
    goPage(Math.floor((rect.left - page().getBoundingClientRect().left + 1) / step), false);
  } else {
    viewport().scrollTop += rect.top - viewport().getBoundingClientRect().top - 60;
  }
}

function showElement(/** @type {Element} */ el) {
  if (layout === "pages") {
    goPage(Math.floor((el.getBoundingClientRect().left - page().getBoundingClientRect().left + 1) / step), false);
  } else {
    el.scrollIntoView({ block: "start" });
  }
}

/** Offset of the first character visible at the top of the page. */
function visibleOffset() {
  const p = page();
  const pr = p.getBoundingClientRect();
  const vr = viewport().getBoundingClientRect();
  const x = layout === "pages" ? pr.left + pageIndex * step + 2 : pr.left + 2;
  const top = Math.max(vr.top + parseFloat(getComputedStyle(viewport()).paddingTop), pr.top) + 4;
  for (let y = top; y < top + 120; y += 12) {
    const hit = document.caretRangeFromPoint?.(x + 8, y);
    if (hit && p.contains(hit.startContainer)) return offsetOf(p, hit.startContainer, hit.startOffset);
  }
  // Fallback: the first stamped block that starts inside the visible area.
  for (const el of p.querySelectorAll("[data-o]")) {
    const r = el.getBoundingClientRect();
    if (layout === "pages" ? r.left >= x - 4 : r.bottom >= top) return Number(/** @type {HTMLElement} */ (el).dataset.o);
  }
  return 0;
}

const savePosition = debounce(async () => {
  if (!book || busy || state.view !== "reader") return;
  const at = locator(chapter, visibleOffset());
  book.position = at;
  updateProgress();
  reportState();
  if (!book.book) return;
  await call("save_position", { locator: at }).catch(fail);
  // Scenes (range atmospheres) can change the look inside a chapter.
  atmosphere.apply(await lookAt(at));
}, 500);

/** Tells the window state what the reader sees, for `vibe-reader live` and `context`. */
function reportState() {
  const span = selectionSpan();
  const selection = span ? { start: locator(chapter, span.start), end: locator(chapter, span.end), text: span.text } : null;
  call("report_state", { live: { position: book?.position ?? null, selection } }).catch(() => {});
}

function updateProgress() {
  if (!book) return;
  const total = book.chapters.reduce((s, c) => s + c.chars, 0) || 1;
  const before = book.chapters.slice(0, chapter).reduce((s, c) => s + c.chars, 0);
  const at = parseLocator(book.position);
  $("#progress").style.width = `${(100 * (before + (at.chapter === chapter ? at.offset : 0))) / total}%`;
}

function updateChrome() {
  if (!book) return;
  $("#foot-chapter").textContent = book.chapters[chapter]?.title || t("chapterN", { n: chapter + 1 });
  $("#foot-page").textContent = layout === "pages" ? t("pageOf", { page: pageIndex + 1, pages }) : "";
  updateProgress();
}

// ---------- annotations ----------

function chapterAnnotations() {
  return (book?.annotations ?? []).filter((a) => parseLocator(a.start).chapter === chapter && a.kind !== "bookmark");
}

function paintAnnotations() {
  for (const el of page().querySelectorAll(".mark")) el.remove();
  if (!("highlights" in CSS)) return;
  const user = new Highlight();
  const agent = new Highlight();
  const pr = page().getBoundingClientRect();
  for (const a of chapterAnnotations()) {
    const start = parseLocator(a.start).offset;
    const endLoc = parseLocator(a.end);
    const end = endLoc.chapter === chapter ? endLoc.offset : start + 1;
    const range = rangeOf(page(), start, Math.max(end, start + 1));
    if (!range) continue;
    // A note on a point gets only its mark; spans are underlined.
    if (end > start) (isAgent(a.author) ? agent : user).add(range);
    if (!a.body) continue;
    const rect = range.getClientRects()[0];
    if (!rect) continue;
    const mark = document.createElement("button");
    mark.className = `mark ${isAgent(a.author) ? "agent" : ""}`;
    mark.dataset.skip = "";
    mark.textContent = isAgent(a.author) ? "✦" : "✎";
    const column = layout === "pages" ? Math.floor((rect.left - pr.left) / (columnWidth + GAP)) * (columnWidth + GAP) : 0;
    mark.style.left = `${column}px`;
    mark.style.top = `${rect.top - pr.top + 3}px`;
    mark.addEventListener("click", (e) => {
      e.stopPropagation();
      openNote(a, rect);
    });
    page().append(mark);
  }
  CSS.highlights.set("user", user);
  CSS.highlights.set("agent", agent);
}

/** Selection inside the page as chapter offsets. */
function selectionSpan() {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !page().contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0);
  const start = offsetOf(page(), r.startContainer, r.startOffset);
  const end = offsetOf(page(), r.endContainer, r.endOffset);
  return end > start ? { start, end, rect: r.getBoundingClientRect(), text: sel.toString() } : null;
}

function showSelbar() {
  const span = selectionSpan();
  const bar = $("#selbar");
  if (!span || !book?.book) return void (bar.hidden = true);
  const rr = reader().getBoundingClientRect();
  bar.style.left = `${span.rect.left + span.rect.width / 2 - rr.left}px`;
  bar.style.top = `${span.rect.top - rr.top - 8}px`;
  bar.hidden = false;
}

async function annotate(/** @type {"note" | "highlight" | "bookmark"} */ kind, start, end, body = "") {
  const a = await call("annotate", { kind, start: locator(chapter, start), end: locator(chapter, end), body });
  book.annotations.push(a);
  paintAnnotations();
  renderNotes();
  return a;
}

/** Shows a note: editable for the reader's own notes, read-only for agents. */
function openNote(/** @type {Annotation | null} */ a, /** @type {DOMRect} */ rect, /** @type {{start: number, end: number, text: string} | null} */ fresh = null) {
  const pop = $("#notepop");
  const rr = reader().getBoundingClientRect();
  const own = !a || !isAgent(a.author);
  const quote = a ? a.quote : fresh.text;
  pop.innerHTML = `
    <div class="by">${a && isAgent(a.author) ? escapeHtml(t("agent", { name: a.author })) : t("you")}</div>
    <div class="q">${escapeHtml(quote)}</div>
    ${own ? `<textarea>${escapeHtml(a?.body ?? "")}</textarea>` : `<div class="b">${escapeHtml(a.body)}</div>`}
    <div class="row">
      ${a && own ? `<button class="btn quiet" data-act="delete">${t("delete")}</button>` : ""}
      <button class="btn quiet" data-act="cancel">${t("cancel")}</button>
      ${own ? `<button class="btn" data-act="save">${t("save")}</button>` : ""}
    </div>`;
  pop.style.left = `${Math.min(Math.max(rect.left + rect.width / 2 - rr.left, 220), rr.width - 220)}px`;
  pop.style.top = `${Math.min(rect.bottom - rr.top + 10, rr.height - 260)}px`;
  pop.hidden = false;
  const area = pop.querySelector("textarea");
  area?.focus();
  const close = () => (pop.hidden = true);
  pop.querySelector('[data-act="cancel"]').addEventListener("click", close);
  pop.querySelector('[data-act="delete"]')?.addEventListener("click", async () => {
    await call("delete_annotation", { id: a.id }).catch(fail);
    book.annotations = book.annotations.filter((x) => x.id !== a.id);
    paintAnnotations();
    renderNotes();
    close();
  });
  pop.querySelector('[data-act="save"]')?.addEventListener("click", async () => {
    const body = area.value.trim();
    try {
      if (a) {
        const edited = await call("edit_annotation", { id: a.id, body });
        book.annotations = book.annotations.map((x) => (x.id === a.id ? edited : x));
        paintAnnotations();
        renderNotes();
      } else if (fresh) {
        await annotate("note", fresh.start, fresh.end, body);
      }
    } catch (e) {
      fail(e);
    }
    close();
  });
  area?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) pop.querySelector('[data-act="save"]').click();
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });
}

export async function bookmark() {
  if (!book?.book) return;
  const offset = visibleOffset();
  await annotate("bookmark", offset, offset).catch(fail);
  toast(t("bookmarked"));
}

// ---------- panels ----------

export function togglePanel(/** @type {"toc" | "notes" | "settings"} */ id) {
  for (const other of ["toc", "notes", "settings"]) if (other !== id) $(`#${other}`).classList.remove("open");
  $(`#${id}`).classList.toggle("open");
}

export function closeOverlays() {
  const open = [...document.querySelectorAll(".panel.open")];
  const pop = $("#notepop");
  if (!pop.hidden || !$("#selbar").hidden) {
    pop.hidden = true;
    $("#selbar").hidden = true;
    return true;
  }
  open.forEach((p) => p.classList.remove("open"));
  return open.length > 0;
}

function renderToc() {
  if (!book) return;
  const toc = $("#toc");
  toc.innerHTML = `<h3>${t("contents")}</h3>`;
  for (const entry of book.toc) {
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = entry.title || t("chapterN", { n: entry.chapter + 1 });
    a.style.paddingLeft = `${entry.level * 14}px`;
    a.classList.toggle("current", entry.chapter === chapter);
    a.addEventListener("click", (e) => {
      e.preventDefault();
      toc.classList.remove("open");
      loadChapter(entry.chapter, { anchor: entry.anchor });
    });
    toc.append(a);
  }
}

function renderNotes() {
  if (!book) return;
  const panel = $("#notes");
  panel.innerHTML = `<h3>${t("notes")}</h3>`;
  const items = [...book.annotations].sort((a, b) => {
    const x = parseLocator(a.start), y = parseLocator(b.start);
    return x.chapter - y.chapter || x.offset - y.offset;
  });
  if (!items.length) panel.insertAdjacentHTML("beforeend", `<p class="note-item">${escapeHtml(t("noNotes"))}</p>`);
  for (const a of items) {
    const item = document.createElement("div");
    item.className = `note-item ${isAgent(a.author) ? "agent" : ""}`;
    const at = parseLocator(a.start);
    item.innerHTML = `
      ${a.quote ? `<div class="q">«${escapeHtml(a.quote.slice(0, 160))}»</div>` : ""}
      ${a.body ? `<div class="b">${escapeHtml(a.body)}</div>` : ""}
      <div class="by"><span>${escapeHtml(book.chapters[at.chapter]?.title || t("chapterN", { n: at.chapter + 1 }))} · ${t(`kind_${a.kind}`)}</span>
      <span>${isAgent(a.author) ? escapeHtml(t("agent", { name: a.author })) : t("you")}</span></div>`;
    item.addEventListener("click", () => {
      panel.classList.remove("open");
      at.chapter === chapter ? showOffset(at.offset) : loadChapter(at.chapter, { offset: at.offset });
    });
    panel.append(item);
  }
}

/** Follows links inside the book; external links are only shown. */
function onLink(/** @type {MouseEvent} */ e) {
  const a = /** @type {HTMLAnchorElement | null} */ (/** @type {Element} */ (e.target).closest("a[href]"));
  if (!a || !book) return;
  e.preventDefault();
  const href = a.getAttribute("href");
  if (href.startsWith("#")) {
    const target = page().querySelector(`#${CSS.escape(decodeURIComponent(href.slice(1)))}`);
    if (target) showElement(target);
  } else if (href.startsWith("/res/")) {
    const [path, anchor] = decodeURIComponent(href.slice(5)).split("#");
    const index = book.paths.indexOf(path);
    if (index >= 0) loadChapter(index, { anchor: anchor || null });
  } else {
    toast(href);
  }
}

export function relayoutKeepingPlace() {
  if (!book || state.view !== "reader") return;
  const offset = visibleOffset();
  busy = true;
  relayout();
  showOffset(offset);
  paintAnnotations();
  updateChrome();
  busy = false;
}

export function toggleLayout() {
  if (!book) return;
  const offset = visibleOffset();
  layout = layout === "pages" ? "scroll" : "pages";
  reader().dataset.layout = layout;
  busy = true;
  relayout();
  showOffset(offset);
  paintAnnotations();
  updateChrome();
  busy = false;
}

export function init() {
  page().addEventListener("click", onLink);
  viewport().addEventListener("mouseup", () => setTimeout(showSelbar, 0));
  viewport().addEventListener("scroll", () => {
    $("#selbar").hidden = true;
    if (layout === "scroll") savePosition();
  });
  $("#selbar").addEventListener("mousedown", (e) => e.preventDefault());
  $("#selbar").addEventListener("click", async (e) => {
    const act = /** @type {HTMLElement} */ (e.target).closest("[data-act]")?.dataset.act;
    const span = selectionSpan();
    $("#selbar").hidden = true;
    if (!span) return;
    if (act === "copy") navigator.clipboard.writeText(span.text).then(() => toast(t("copied")));
    if (act === "highlight") await annotate("highlight", span.start, span.end).catch(fail);
    if (act === "note") openNote(null, span.rect, span);
    getSelection()?.removeAllRanges();
  });
  $("#toggle-toc").addEventListener("click", () => togglePanel("toc"));
  $("#toggle-notes").addEventListener("click", () => togglePanel("notes"));
  $("#toggle-settings").addEventListener("click", () => togglePanel("settings"));
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
  document.fonts?.addEventListener?.("loadingdone", () => relayoutKeepingPlace());
  document.addEventListener("selectionchange", debounce(() => book && reportState(), 300));
  on("live-goto", ({ payload }) => {
    const at = parseLocator(payload);
    at.chapter === chapter ? showOffset(at.offset) : loadChapter(at.chapter, { offset: at.offset });
  });
  on("live-highlight", async ({ payload }) => {
    const start = parseLocator(payload.start), end = parseLocator(payload.end);
    if (start.chapter !== chapter) await loadChapter(start.chapter, { offset: start.offset });
    else showOffset(start.offset);
    const range = rangeOf(page(), start.offset, end.chapter === start.chapter ? end.offset : start.offset + 200);
    if (range && "highlights" in CSS) CSS.highlights.set("found", new Highlight(range));
    setTimeout(() => CSS.highlights?.delete("found"), 8000);
  });
  on("live-reload", async () => {
    const fresh = await call("refresh_open").catch(() => null);
    if (!fresh || !book) return;
    book.annotations = fresh.annotations;
    book.art = fresh.art;
    renderNotes();
    await loadChapter(chapter, { offset: visibleOffset(), initial: true });
  });
  on("book-changed", async () => {
    if (!book) return;
    const offset = visibleOffset();
    await loadChapter(Math.min(chapter, book.chapters.length - 1), { offset });
    toast(t("reloaded"));
  });

  const inReader = () => state.view === "reader" && !!book;
  commands.set("contents", { label: () => t("cmdContents"), run: () => togglePanel("toc"), when: inReader, key: "T" });
  commands.set("notes", { label: () => t("cmdNotes"), run: () => togglePanel("notes"), when: inReader, key: "N" });
  commands.set("settings", { label: () => t("cmdSettings"), run: () => togglePanel("settings"), when: inReader, key: "," });
  commands.set("next-chapter", { label: () => t("cmdNextChapter"), run: nextChapter, when: inReader, key: "]" });
  commands.set("prev-chapter", { label: () => t("cmdPrevChapter"), run: prevChapter, when: inReader, key: "[" });
  commands.set("layout", { label: () => t("cmdLayout"), run: toggleLayout, when: inReader, key: "L" });
  commands.set("bookmark", { label: () => t("cmdBookmark"), run: bookmark, when: () => inReader() && !!book.book, key: "B" });
}
