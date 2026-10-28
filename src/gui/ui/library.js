// Home screen: the mini shelf with recent books and the full library grouped by shelves or authors.

import { $, call, commands, escapeHtml, fail, state } from "./core.js";
import { t } from "./i18n.js";

/** @typedef {import("./core.js").Book} Book */

/** @type {Book[]} */
let books = [];
/** Book id to cover art file. @type {Record<string, string>} */
let covers = {};
let grouping = "shelf";
let query = "";
/** @type {Book | null} */
let active = null;
/** Set by app.js: opens a book in the reader. @type {(id: number) => void} */
export let onOpen = () => {};
export const setOnOpen = (/** @type {(id: number) => void} */ fn) => (onOpen = fn);

const home = () => $("#home");

export async function refresh() {
  ({ books, covers } = await call("library"));
  render();
}

export function setMode(/** @type {"shelf" | "library"} */ mode) {
  home().dataset.mode = mode;
  $("#expand").setAttribute("aria-pressed", String(mode === "library"));
}

export const toggleMode = () => setMode(home().dataset.mode === "shelf" ? "library" : "shelf");

const percent = (/** @type {number} */ p) => `${Math.round(p * 100)}%`;

/** Spine size follows the book: height by length, width by chapter count. */
function spine(/** @type {Book} */ book) {
  const el = document.createElement("button");
  el.className = `spine ${book.status}`;
  el.dataset.id = String(book.id);
  const h = Math.round(150 + Math.min(110, Math.log10(Math.max(book.words, 1000)) * 40 - 110));
  const w = Math.round(26 + Math.min(26, Math.sqrt(book.words / 4000)));
  el.style.cssText = `--spine:${book.color};--h:${h}px;--w:${w}px;--fill:${book.progress}`;
  el.innerHTML = `<span class="t">${escapeHtml(book.title)}</span>`;
  el.title = [book.title, book.authors.join(", ")].filter(Boolean).join(" — ");
  el.addEventListener("mouseenter", () => select(book));
  el.addEventListener("focus", () => select(book));
  el.addEventListener("click", () => onOpen(book.id));
  return el;
}

function group(/** @type {string} */ title, /** @type {Book[]} */ list, cls = "") {
  const section = document.createElement("section");
  section.className = `group ${cls}`;
  section.innerHTML = `<h3 class="group-title">${escapeHtml(title)}</h3><div class="shelf"></div>`;
  const shelf = /** @type {HTMLElement} */ (section.lastElementChild);
  for (const book of list) shelf.append(spine(book));
  return section;
}

function visible() {
  const q = query.trim().toLowerCase();
  if (!q) return books;
  return books.filter((b) => b.title.toLowerCase().includes(q) || b.authors.some((a) => a.toLowerCase().includes(q)));
}

function render() {
  const root = $("#shelves");
  root.replaceChildren();
  const list = visible();
  if (!books.length) {
    root.innerHTML = `<div class="empty"><h2>${t("emptyTitle")}</h2><p>${escapeHtml(t("emptyText"))}</p></div>`;
    $("#card").replaceChildren();
    return;
  }
  root.append(group(t("recent"), list.slice(0, 16), "recent"));
  /** @type {Map<string, Book[]>} */
  const groups = new Map();
  for (const book of list) {
    const keys = grouping === "shelf" ? book.shelves : book.authors;
    for (const key of keys.length ? keys : [""]) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(book);
    }
  }
  const empty = grouping === "shelf" ? t("noShelf") : t("noAuthor");
  const names = [...groups.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  for (const name of names) root.append(group(name || empty, groups.get(name)));
  for (const btn of $("#grouping").children) btn.setAttribute("aria-pressed", String(btn.dataset.group === grouping));
  select(active && list.includes(active) ? active : list[0] ?? null);
}

function select(/** @type {Book | null} */ book) {
  active = book;
  const card = $("#card");
  for (const el of document.querySelectorAll(".spine.active")) el.classList.remove("active");
  if (!book) return card.replaceChildren();
  for (const el of document.querySelectorAll(`.spine[data-id="${book.id}"]`)) el.classList.add("active");
  const started = book.progress > 0;
  card.style.setProperty("--spine", book.color);
  card.innerHTML = `
    ${covers[book.id]
      ? `<div class="cover art"><img alt="" src="/art/${encodeURIComponent(covers[book.id])}"></div>`
      : `<div class="cover"><span>${escapeHtml(book.title)}</span><small>${escapeHtml(book.authors[0] ?? book.format)}</small></div>`}
    <div>
      <h2>${escapeHtml(book.title)}</h2>
      <div class="meta">${escapeHtml(book.authors.join(", "))}</div>
      <div class="chips">
        <span class="chip">${book.format.toUpperCase()}</span>
        <span class="chip">${t(book.status)}</span>
        <span class="chip">${t("progressOf", { percent: percent(book.progress) })}</span>
        <span class="chip">${t("words", { n: book.words.toLocaleString() })}</span>
        ${book.shelves.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join("")}
      </div>
      <div class="actions">
        <button class="btn" data-act="open">${t(started ? "continue" : "read")}</button>
        ${book.status === "finished" || book.status === "dropped"
          ? `<button class="btn quiet" data-act="reading">${t("markReading")}</button>`
          : `<button class="btn quiet" data-act="finished">${t("markFinished")}</button><button class="btn quiet" data-act="dropped">${t("markDropped")}</button>`}
      </div>
    </div>`;
  card.querySelector('[data-act="open"]').addEventListener("click", () => onOpen(book.id));
  for (const btn of card.querySelectorAll("[data-act]:not([data-act=open])")) {
    btn.addEventListener("click", () =>
      call("set_status", { id: book.id, status: btn.dataset.act }).then(refresh).catch(fail),
    );
  }
}

export function init() {
  const search = /** @type {HTMLInputElement} */ ($("#search"));
  search.addEventListener("input", () => {
    query = search.value;
    render();
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && visible()[0]) onOpen(visible()[0].id);
    if (e.key === "Escape") search.blur();
  });
  for (const btn of $("#grouping").children) {
    btn.addEventListener("click", () => {
      grouping = btn.dataset.group;
      setMode("library");
      render();
    });
  }
  $("#expand").addEventListener("click", toggleMode);
  commands.set("library", { label: () => t("cmdLibrary"), run: () => app().goHome(), when: () => !state.lite });
}

/** Lazy access to app.js to avoid an import cycle at load time. */
const app = () => /** @type {any} */ (window).vibe;

/** Books for the palette. */
export const allBooks = () => books;
