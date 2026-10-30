// Library: the desk with books being read, the filter strip (statuses, shelves, authors), the
// bookcase of spines, the catalog card of the selected book, book menus and dialogs, and the mini window.

import { $, call, commands, escapeHtml, fail, saveConfig, state } from "./core.js";
import * as globe from "./globe.js";
import { t } from "./i18n.js";
import { pdfCover } from "./pdfcover.js";
import { ask, confirmAction, dialog, icon, menu, paintIcons, select, toast } from "./ui.js";

/** @typedef {import("./core.js").Book} Book */

/** @type {Book[]} */
let books = [];
/** @type {{id: number, name: string, books: number}[]} */
let shelves = [];
/** @type {{id: string, name: string, description: string, modes: string[], spine: string | null}[]} */
let presets = [];
let query = "";
/** `all`, `reading`, `unread`, `finished`, `dropped`, `shelf:<name>` or `author:<name>`. */
let filter = "all";
/** @type {number | null} */
let selected = null;

/** Set by app.js: opens a book in the reader. @type {(id: number) => void} */
export let onOpen = () => {};
export const setOnOpen = (/** @type {(id: number) => void} */ fn) => (onOpen = fn);
export const allBooks = () => books;

const home = () => $("#home");

/** The globe of the desk; one element kept across renders, so it does not gather again on each refresh. */
const globeBox = document.createElement("div");
globeBox.className = "globe";
globeBox.innerHTML = `<canvas role="img"></canvas>`;

export async function refresh() {
  ({ books, shelves } = await call("library"));
  if (!presets.length) presets = await call("presets").catch(() => []);
  // A wide window shows the card of the last book read rather than an empty panel.
  if (selected === null && matchMedia("(min-width: 1181px)").matches) selected = [...books].sort(SORTS.recent)[0]?.id ?? null;
  render();
}

// ---------- helpers ----------

const percent = (/** @type {number} */ p) => `${Math.round(p * 100)}%`;

function surname(/** @type {string} */ name) {
  const parts = name.trim().split(/\s+/);
  // "Гельфанд И.М." keeps the first word; "Charles Petzold" keeps the last.
  return parts.length > 1 && /\./.test(parts.slice(1).join("")) ? parts[0] : parts.at(-1) ?? "";
}

/** White lettering on dark cloth, dark on light cloth. */
function stampFor(/** @type {string} */ hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#1f1a2e" : "#ffffff";
}

/** Average color of each cover, so a spine wears the colors of its book. @type {Map<string, string | null>} */
const tints = new Map();

function tint(/** @type {Book} */ book, /** @type {HTMLElement} */ el) {
  const key = `${book.id}:${book.opened_at ?? 0}`;
  const paint = (/** @type {string | null | undefined} */ hex) => {
    if (!hex) return;
    el.style.setProperty("--cloth", hex);
    el.style.setProperty("--stamp", stampFor(hex));
  };
  if (tints.has(key)) return void paint(tints.get(key));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 6;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 6, 6);
    const d = ctx.getImageData(0, 0, 6, 6).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
    // Darkened a little so white lettering and the shelf light read on it.
    const hex = `#${sum.map((v) => Math.round((v / (d.length / 4)) * 0.82).toString(16).padStart(2, "0")).join("")}`;
    tints.set(key, hex);
    paint(hex);
  };
  img.onerror = () => tints.set(key, null);
  img.src = `/cover/${book.id}?v=${book.opened_at ?? 0}`;
}

function matches(/** @type {Book} */ b) {
  const q = query.trim().toLowerCase();
  if (q && !b.title.toLowerCase().includes(q) && !b.authors.some((a) => a.toLowerCase().includes(q))) return false;
  if (filter === "all") return true;
  if (["reading", "unread", "finished", "dropped"].includes(filter)) return b.status === filter;
  if (filter.startsWith("shelf:")) return b.shelves.includes(filter.slice(6));
  if (filter.startsWith("author:")) return b.authors.includes(filter.slice(7));
  return true;
}

const SORTS = {
  recent: (a, b) => (b.opened_at ?? 0) - (a.opened_at ?? 0) || b.added_at - a.added_at,
  title: (a, b) => a.title.localeCompare(b.title),
  author: (a, b) => (a.authors[0] ?? "￿").localeCompare(b.authors[0] ?? "￿") || a.title.localeCompare(b.title),
  progress: (a, b) => b.progress - a.progress,
  added: (a, b) => b.added_at - a.added_at,
};

function visible() {
  return books.filter(matches).sort(SORTS[state.config.library.sort] ?? SORTS.recent);
}

// ---------- render ----------

function render() {
  renderDesk();
  renderFilters();
  renderStacks();
  renderDetails();
}

// ---------- desk ----------

/** The book to continue as a large card, the other books being read beside it, and the reading log. */
function renderDesk() {
  const desk = $("#desk");
  desk.hidden = !books.length;
  if (!books.length) return;
  const reading = books.filter((b) => b.status === "reading" && b.progress < 1).sort(SORTS.recent).slice(0, 4);
  desk.innerHTML = `<div class="desk-main"></div><div class="desk-side"><div class="log" hidden></div></div>`;
  const main = desk.querySelector(".desk-main");
  const [first, ...rest] = reading;
  if (!first) main.innerHTML = `<p class="desk-empty">${escapeHtml(t("deskEmpty"))}</p>`;
  else {
    const hero = document.createElement("article");
    hero.className = "hero";
    hero.style.setProperty("--cloth", first.color);
    hero.innerHTML = `<div class="glow"></div><span class="hero-label">${escapeHtml(t("onTheDesk"))}</span>
      <div class="cover-slot">${coverHtml(first)}</div>
      <div><h2></h2><p class="by"></p><p class="where"></p>
        <div class="row"><span class="meter"><span class="bar"><i style="width:${percent(first.progress)}"></i></span><span>${percent(first.progress)}</span></span>
        <button class="btn primary">${icon("bookOpen", 16)}${escapeHtml(t("continue"))}</button></div></div>`;
    hero.querySelector("h2").textContent = first.title;
    hero.querySelector(".by").textContent = first.authors.join(", ");
    hero.querySelector(".where").textContent = whereIn(first);
    hero.querySelector("button").addEventListener("click", () => onOpen(first.id));
    hero.querySelector(".cover-slot").addEventListener("click", () => onOpen(first.id));
    bookContext(hero, first);
    main.append(hero);
    loadCover(first, /** @type {HTMLElement} */ (hero.querySelector(".cover-slot")), (src) => {
      /** @type {HTMLElement} */ (hero.querySelector(".glow")).style.background = `url("${src}") center / cover`;
    });
  }
  const side = desk.querySelector(".desk-side");
  for (const book of rest) {
    const b = document.createElement("button");
    b.className = "desk-book";
    b.innerHTML = `<div class="cover-slot">${coverHtml(book)}</div>
      <span><b></b><span class="meter"><span class="bar"><i style="width:${percent(book.progress)}"></i></span><span>${percent(book.progress)}</span></span></span>`;
    b.querySelector("b").textContent = book.title;
    b.title = [book.title, book.authors.join(", ")].filter(Boolean).join("\n");
    b.addEventListener("click", () => onOpen(book.id));
    bookContext(b, book);
    side.insertBefore(b, side.querySelector(".log"));
    loadCover(book, /** @type {HTMLElement} */ (b.querySelector(".cover-slot")));
  }
  main.append(globeBox);
  globe.setBooks(books);
  renderLog(/** @type {HTMLElement} */ (desk.querySelector(".log")));
}

/** "Page 58 of 530" or "Chapter 7 of 40": where the reader stopped. */
function whereIn(/** @type {Book} */ book) {
  const total = book.chapter_chars.length;
  const n = Math.min(total, Number(/^ch:(\d+)/.exec(book.position ?? "")?.[1] ?? 1));
  return t(book.format === "pdf" ? "heroPage" : "heroChapter", { n, total });
}

function bookContext(/** @type {HTMLElement} */ el, /** @type {Book} */ book) {
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    selectBook(book.id);
    menu({ x: e.clientX, y: e.clientY }, bookMenu(book));
  });
}

/** Minutes read in the last seven days, and how many days in a row the reader has opened a book. */
async function renderLog(/** @type {HTMLElement} */ box) {
  const sessions = await call("sessions", { days: 60 }).catch(() => []);
  if (!sessions.length) return;
  const day = (/** @type {number} */ s) => new Date(s * 1000).toDateString();
  /** @type {Map<string, number>} */
  const minutes = new Map();
  for (const s of sessions) minutes.set(day(s.started_at), (minutes.get(day(s.started_at)) ?? 0) + (s.ended_at - s.started_at) / 60);
  const today = Date.now() / 1000;
  const week = Array.from({ length: 7 }, (_, i) => minutes.get(day(today - (6 - i) * 86400)) ?? 0);
  let streak = 0;
  // A streak still counts when today has no reading yet.
  for (let i = minutes.has(day(today)) ? 0 : 1; minutes.has(day(today - i * 86400)); i++) streak++;
  const max = Math.max(...week, 1);
  const total = Math.round(week.reduce((a, b) => a + b, 0));
  if (!total && streak < 2) return;
  box.innerHTML = `<span>${escapeHtml(t("thisWeek"))}</span><div class="week"></div><b></b><span></span>`;
  box.querySelector("b").textContent = total >= 60 ? t("hoursMinutes", { h: Math.floor(total / 60), m: total % 60 }) : t("minutesN", { n: total });
  box.querySelector(".week").innerHTML = week
    .map((m, i) => `<i class="${i === 6 ? "today" : m ? "" : "none"}" style="height:${Math.max(4, (m / max) * 100)}%" title="${Math.round(m)}"></i>`)
    .join("");
  box.lastElementChild.textContent = streak > 1 ? t("streak", { n: streak }) : "";
  box.hidden = false;
}

function chip(/** @type {string} */ key, /** @type {string} */ iconName, /** @type {string} */ label, /** @type {number} */ count) {
  const b = document.createElement("button");
  b.className = "filter";
  b.setAttribute("aria-current", String(filter === key));
  b.innerHTML = `${icon(/** @type {any} */ (iconName), 15)}<span class="name"></span><span class="count">${count}</span>`;
  b.querySelector(".name").textContent = label;
  b.addEventListener("click", () => {
    // A second click on the current filter goes back to all books.
    filter = filter === key ? "all" : key;
    render();
  });
  return b;
}

/** The filter strip over the shelves: statuses, shelves (drop targets too) and an authors menu. */
function renderFilters() {
  const bar = $("#filters");
  bar.hidden = !books.length;
  bar.replaceChildren();
  const count = (/** @type {(b: Book) => boolean} */ f) => books.filter(f).length;
  bar.append(chip("all", "books", t("allBooks"), books.length));
  for (const [status, iconName] of [["reading", "bookOpen"], ["unread", "circle"], ["finished", "done"], ["dropped", "drop"]]) {
    const n = count((b) => b.status === status);
    // Empty statuses only add noise; the current one stays so it can be cleared.
    if (n || filter === status) bar.append(chip(status, iconName, t(status), n));
  }

  bar.insertAdjacentHTML("beforeend", `<span class="filter-sep"></span>`);
  for (const shelf of shelves) {
    const item = chip(`shelf:${shelf.name}`, "shelf", shelf.name, shelf.books);
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      menu({ x: e.clientX, y: e.clientY }, shelfMenu(shelf.name));
    });
    // Spines can be dropped onto a shelf.
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      item.classList.add("drop-target");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drop-target"));
    item.addEventListener("drop", async (e) => {
      e.preventDefault();
      item.classList.remove("drop-target");
      const id = Number(e.dataTransfer.getData("text/x-book"));
      if (id) await shelve(id, shelf.name, true);
    });
    bar.append(item);
  }
  const add = document.createElement("button");
  add.className = "filter add";
  add.innerHTML = `${icon("plus", 15)}<span class="name"></span>`;
  add.querySelector(".name").textContent = shelves.length ? t("newShelf") : t("createFirstShelf");
  add.addEventListener("click", () => newShelf());
  bar.append(add);

  /** @type {Map<string, number>} */
  const authors = new Map();
  for (const b of books) for (const a of b.authors) authors.set(a, (authors.get(a) ?? 0) + 1);
  if (!authors.size) return;
  const current = filter.startsWith("author:") ? filter.slice(7) : null;
  const pick = document.createElement("button");
  pick.className = "filter authors";
  pick.setAttribute("aria-current", String(!!current));
  pick.innerHTML = `${icon("user", 15)}<span class="name"></span>${icon("chevronDown", 14)}`;
  pick.querySelector(".name").textContent = current ?? t("authors");
  const list = [...authors].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  pick.addEventListener("click", () => menu(pick, [
    ...(current ? [{ label: t("allBooks"), icon: "books", run: () => ((filter = "all"), render()) }, { separator: true }] : []),
    ...list.map(([name, n]) => ({ label: name, hint: String(n), checked: name === current, run: () => ((filter = `author:${name}`), render()) })),
  ], { align: "end" }));
  bar.append(pick);
}

function spine(/** @type {Book} */ book) {
  const el = document.createElement("button");
  el.className = `spine ${book.status}`;
  el.dataset.id = String(book.id);
  el.draggable = true;
  // Height follows the length of the book, thickness its size.
  const size = Math.max(book.words, 2000);
  const h = Math.round(176 + Math.min(84, Math.log2(size / 2000) * 12));
  const w = Math.round(30 + Math.min(30, Math.sqrt(size / 3500)));
  el.style.cssText = `--cloth:${book.color};--stamp:${stampFor(book.color)};--h:${h}px;--w:${w}px`;
  const author = book.authors[0] ? surname(book.authors[0]) : "";
  el.innerHTML = `<span class="t"></span><span class="a"></span>${book.progress > 0 ? `<span class="read"><i style="width:${percent(book.progress)}"></i></span>` : ""}`;
  el.querySelector(".t").textContent = book.title;
  el.querySelector(".a").textContent = author;
  el.setAttribute("aria-label", [book.title, book.authors.join(", "), percent(book.progress)].filter(Boolean).join(", "));
  el.addEventListener("pointerenter", () => peek(book, el));
  el.addEventListener("pointerleave", () => peek(null, el));
  tint(book, el);
  el.setAttribute("aria-selected", String(book.id === selected));
  el.addEventListener("click", () => selectBook(book.id));
  el.addEventListener("dblclick", () => onOpen(book.id));
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    selectBook(book.id);
    menu({ x: e.clientX, y: e.clientY }, bookMenu(book));
  });
  el.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/x-book", String(book.id));
    el.classList.add("dragging");
  });
  el.addEventListener("dragend", () => el.classList.remove("dragging"));
  return el;
}

let peekTimer = 0;
/** Shows the cover of the spine under the cursor above the shelf. */
function peek(/** @type {Book | null} */ book, /** @type {HTMLElement} */ el) {
  let box = $("#room .peek");
  clearTimeout(peekTimer);
  if (!book) return box?.classList.remove("on");
  if (!box) {
    box = document.createElement("div");
    box.className = "peek";
    box.setAttribute("aria-hidden", "true");
    $("#room").append(box);
  }
  const target = box;
  peekTimer = setTimeout(() => {
    const room = $("#room");
    const rr = room.getBoundingClientRect();
    const sr = el.getBoundingClientRect();
    target.innerHTML = `<div class="cover-slot">${coverHtml(book)}</div><p></p>`;
    target.querySelector("p").textContent = book.title;
    loadCover(book, /** @type {HTMLElement} */ (target.querySelector(".cover-slot")));
    const left = sr.left - rr.left + room.scrollLeft + sr.width / 2 - 66;
    target.style.left = `${Math.max(8, Math.min(left, room.clientWidth - 140))}px`;
    target.style.top = `${sr.top - rr.top + room.scrollTop - 250}px`;
    target.classList.add("on");
  }, 260);
}

function stack(/** @type {string} */ title, /** @type {Book[]} */ list, cls = "") {
  const section = document.createElement("section");
  section.className = `stack ${cls}`;
  section.innerHTML = `<div class="stack-head"><h3></h3><span class="count">${list.length}</span></div><div class="rows"></div>`;
  section.querySelector("h3").textContent = title;
  /** @type {any} */ (section).spines = list.map(spine);
  return section;
}

/** Splits each stack into rows that fit the width, so every row stands on its own board. */
function shelveRows() {
  const root = $("#shelves");
  const width = root.clientWidth - 2 * parseFloat(getComputedStyle(root).paddingLeft) - 28;
  const mini = document.body.dataset.mini === "1";
  for (const section of root.querySelectorAll(".stack")) {
    const spines = /** @type {any} */ (section).spines;
    if (!spines) continue;
    const rows = section.querySelector(".rows");
    rows.replaceChildren();
    let row = null;
    let used = 0;
    for (const el of spines) {
      el.classList.remove("lean");
      const w = parseFloat(el.style.getPropertyValue("--w")) + 2;
      if (!row || (!mini && used + w > width)) {
        row = document.createElement("div");
        row.className = "shelf";
        rows.append(row);
        used = 0;
      }
      row.append(el);
      used += w;
    }
    // With room to spare, the last book leans on its neighbour.
    const last = /** @type {HTMLElement | null} */ (row?.lastElementChild);
    if (last && !mini && row.children.length > 1 && used + 60 < width) last.classList.add("lean");
  }
}

function groupKeys(/** @type {Book} */ b) {
  switch (state.config.library.group) {
    case "shelf": return b.shelves.length ? b.shelves : [t("noShelf")];
    case "author": return b.authors.length ? b.authors : [t("noAuthor")];
    case "format": return [b.format.toUpperCase()];
    case "status": return [t(b.status)];
    default: return [""];
  }
}

function renderStacks() {
  const root = $("#shelves");
  root.replaceChildren();
  const list = visible();
  if (!books.length) {
    root.innerHTML = `<div class="empty">${icon("books", 40)}<h2>${t("emptyTitle")}</h2><p>${escapeHtml(t("emptyText"))}</p>
      <button class="btn primary" id="empty-add">${icon("import", 16)}${t("addBooks")}</button></div>`;
    $("#empty-add").addEventListener("click", () => /** @type {any} */ (window).vibe.pickFiles());
    return;
  }
  // Mini mode shows one shelf: recently opened books and where to continue.
  const recent = [...books].sort(SORTS.recent).slice(0, 24);
  const last = recent.find((b) => b.opened_at);
  const cont = document.createElement("div");
  cont.className = "continue";
  if (last) {
    cont.innerHTML = `<span>${t("continueReading")}</span><b></b><span>${percent(last.progress)}</span>`;
    cont.querySelector("b").textContent = last.title;
    cont.style.cursor = "pointer";
    cont.addEventListener("click", () => onOpen(last.id));
  }
  root.append(cont, stack(t("recent"), recent, "recent"));

  if (!list.length) {
    shelveRows();
    root.insertAdjacentHTML("beforeend", `<div class="empty"><p>${escapeHtml(t("nothingFound"))}</p></div>`);
    return;
  }
  /** @type {Map<string, Book[]>} */
  const groups = new Map();
  for (const b of list) {
    for (const key of groupKeys(b)) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(b);
    }
  }
  const tail = [t("noShelf"), t("noAuthor")];
  const names = [...groups.keys()].sort((a, b) => (tail.includes(a) ? 1 : tail.includes(b) ? -1 : a.localeCompare(b)));
  const heading = filterTitle();
  for (const name of names) root.append(stack(name || heading, groups.get(name)));
  shelveRows();
}

function filterTitle() {
  if (filter.startsWith("shelf:")) return filter.slice(6);
  if (filter.startsWith("author:")) return filter.slice(7);
  return filter === "all" ? t("allBooks") : t(filter);
}

// ---------- details ----------

function coverHtml(/** @type {Book} */ book) {
  return `<div class="cover" style="--cloth:${book.color};--stamp:${stampFor(book.color)}"><span>${escapeHtml(book.title)}</span><small>${escapeHtml(book.authors[0] ?? "")}</small></div>`;
}

const date = (/** @type {number | null} */ s) => (s ? new Date(s * 1000).toLocaleDateString() : "—");

function renderDetails() {
  const card = $("#card");
  const book = books.find((b) => b.id === selected) ?? null;
  home().dataset.card = book ? "open" : "closed";
  if (!book) {
    card.innerHTML = `<p class="details-empty">${t("selectBook")}</p>`;
    return;
  }
  const pages = book.format === "pdf" ? t("pagesN", { n: book.chapter_chars.length }) : t("chaptersN", { n: book.chapter_chars.length });
  card.innerHTML = `
    <button class="icon-btn card-close" data-act="close" title="${escapeHtml(t("close"))}">${icon("close", 16)}</button>
    <div class="cover-slot" style="--cloth:${book.color}">${coverHtml(book)}</div>
    <h2></h2>
    <div class="by"></div>
    <div class="meter"><span class="bar"><i style="width:${percent(book.progress)}"></i></span><span>${percent(book.progress)}</span></div>
    <div class="actions">
      <button class="btn primary" data-act="open">${icon("bookOpen", 16)}${t(book.progress > 0 ? "continue" : "read")}</button>
      <button class="btn" data-act="edit" title="${escapeHtml(t("editDetails"))}">${icon("edit", 16)}</button>
      <button class="btn" data-act="more" title="${escapeHtml(t("more"))}">${icon("more", 16)}</button>
    </div>
    <dl class="facts">
      <dt>${t("status")}</dt><dd><button class="select-btn boxed" data-act="status"><span class="select-value"></span>${icon("chevronDown", 14)}</button></dd>
      <dt>${t("atmosphere")}</dt><dd><button class="select-btn boxed" data-act="look"><span class="select-value">…</span>${icon("chevronDown", 14)}</button></dd>
      <dt>${t("shelves")}</dt><dd><div class="chips" data-act="chips"></div></dd>
      <dt>${t("format")}</dt><dd>${book.format.toUpperCase()}, ${pages}</dd>
      <dt>${t("length")}</dt><dd>${t("words", { n: book.words.toLocaleString() })}</dd>
      <dt>${t("added")}</dt><dd>${date(book.added_at)}</dd>
      <dt>${t("opened")}</dt><dd>${date(book.opened_at)}</dd>
    </dl>
    <div class="path"></div>`;
  card.querySelector("h2").textContent = book.title;
  card.querySelector(".by").textContent = book.authors.join(", ") || t("noAuthor");
  card.querySelector(".path").textContent = book.path;
  card.querySelector('[data-act="open"]').addEventListener("click", () => onOpen(book.id));
  card.querySelector('[data-act="close"]').addEventListener("click", () => selectBook(null));
  card.querySelector('[data-act="edit"]').addEventListener("click", () => editBook(book));
  const more = /** @type {HTMLElement} */ (card.querySelector('[data-act="more"]'));
  more.addEventListener("click", () => menu(more, bookMenu(book), { align: "end" }));

  const statuses = ["unread", "reading", "finished", "dropped"].map((s) => ({ value: s, label: t(s) }));
  select(/** @type {HTMLElement} */ (card.querySelector('[data-act="status"]')), statuses, book.status, (s) => setStatus(book, s));

  const lookBtn = /** @type {HTMLElement} */ (card.querySelector('[data-act="look"]'));
  call("book_preset", { id: book.id }).then((current) => {
    const options = [{ value: "", label: t("defaultPreset") }, ...presets.map((p) => ({ value: p.id, label: p.name }))];
    select(lookBtn, options, current ?? "", (id) => setPreset(book, id || null));
  }).catch(fail);

  const chips = card.querySelector('[data-act="chips"]');
  for (const name of book.shelves) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `<span></span><button title="${escapeHtml(t("removeFromShelf"))}">${icon("close", 12)}</button>`;
    chip.firstElementChild.textContent = name;
    chip.querySelector("button").addEventListener("click", () => shelve(book.id, name, false));
    chips.append(chip);
  }
  const add = document.createElement("button");
  add.className = "chip add";
  add.textContent = t("addToShelf");
  add.addEventListener("click", () => menu(add, shelvesMenu(book)));
  chips.append(add);

  loadCover(book, /** @type {HTMLElement} */ (card.querySelector(".cover-slot")));
}

/** Shows the cover image when there is one; PDFs get their first page drawn once. */
function loadCover(/** @type {Book} */ book, /** @type {HTMLElement} */ slot, onImage = (/** @type {string} */ _src) => {}) {
  const img = new Image();
  img.alt = "";
  img.onload = () => {
    if (!slot.isConnected) return;
    slot.innerHTML = `<div class="cover image"></div>`;
    slot.firstElementChild.append(img);
    onImage(img.src);
  };
  img.onerror = async () => {
    if (book.format !== "pdf" || img.dataset.tried) return;
    img.dataset.tried = "1";
    if (await pdfCover(book.id)) img.src = `/cover/${book.id}?${Date.now()}`;
  };
  img.src = `/cover/${book.id}?v=${book.opened_at ?? 0}`;
}

export function selectBook(/** @type {number | null} */ id) {
  selected = id;
  for (const el of document.querySelectorAll(".spine")) el.setAttribute("aria-selected", String(Number(el.dataset.id) === id));
  renderDetails();
}

// ---------- actions ----------

async function setStatus(/** @type {Book} */ book, /** @type {string} */ status) {
  await call("set_status", { id: book.id, status }).catch(fail);
  await refresh();
}

async function setPreset(/** @type {Book} */ book, /** @type {string | null} */ preset) {
  await call("set_book_preset", { id: book.id, preset }).catch(fail);
  await refresh();
}

async function shelve(/** @type {number} */ id, /** @type {string} */ shelf, /** @type {boolean} */ on) {
  await call("shelve", { shelf, id, on }).catch(fail);
  await refresh();
}

async function newShelf(/** @type {number | null} */ forBook = null) {
  const name = await ask(t("newShelf"), t("shelfName"));
  if (!name) return;
  try {
    await call("create_shelf", { name });
    if (forBook) await call("shelve", { shelf: name, id: forBook, on: true });
    filter = forBook ? filter : `shelf:${name}`;
    await refresh();
  } catch (e) {
    fail(e);
  }
}

function shelfMenu(/** @type {string} */ name) {
  return [
    { label: t("rename"), icon: "edit", run: async () => {
      const to = await ask(t("renameShelf"), t("shelfName"), name);
      if (!to || to === name) return;
      await call("rename_shelf", { from: name, to }).catch(fail);
      if (filter === `shelf:${name}`) filter = `shelf:${to}`;
      await refresh();
    } },
    { separator: true },
    { label: t("deleteShelf"), icon: "trash", danger: true, run: async () => {
      if (!(await confirmAction(t("deleteShelf"), t("deleteShelfText", { name }), t("delete")))) return;
      await call("delete_shelf", { name }).catch(fail);
      if (filter === `shelf:${name}`) filter = "all";
      await refresh();
    } },
  ];
}

function shelvesMenu(/** @type {Book} */ book) {
  return [
    ...shelves.map((s) => ({ label: s.name, checked: book.shelves.includes(s.name), run: () => shelve(book.id, s.name, !book.shelves.includes(s.name)) })),
    ...(shelves.length ? [{ separator: true }] : []),
    { label: t("newShelf"), icon: "plus", run: () => newShelf(book.id) },
  ];
}

/** Everything that can be done with a book; shared by the context menu and the details panel. */
function bookMenu(/** @type {Book} */ book) {
  return [
    { label: t(book.progress > 0 ? "continue" : "read"), icon: "bookOpen", hint: "Enter", run: () => onOpen(book.id) },
    { label: t("editDetails"), icon: "edit", hint: "F2", run: () => editBook(book) },
    { separator: true },
    { label: t("shelves"), icon: "shelf", items: shelvesMenu(book) },
    { label: t("status"), icon: "circle", items: ["unread", "reading", "finished", "dropped"].map((s) => ({ label: t(s), checked: book.status === s, run: () => setStatus(book, s) })) },
    { label: t("atmosphere"), icon: "sparkle", items: [{ label: t("defaultPreset"), run: () => setPreset(book, null) }, ...presets.map((p) => ({ label: p.name, run: () => setPreset(book, p.id) }))] },
    { label: t("changeCover"), icon: "image", run: () => chooseCover(book) },
    { label: t("resetProgress"), icon: "rotate", disabled: !book.position, run: async () => {
      if (!(await confirmAction(t("resetProgress"), t("resetProgressText"), t("reset"), false))) return;
      await call("reset_position", { id: book.id }).catch(fail);
      await refresh();
    } },
    { label: t("copyPath"), icon: "copy", run: () => navigator.clipboard.writeText(book.path).then(() => toast(t("copied"))) },
    { separator: true },
    { label: t("removeBook"), icon: "trash", hint: "Del", danger: true, run: () => removeBook(book) },
  ];
}

async function chooseCover(/** @type {Book} */ book) {
  const path = await window.__TAURI__.dialog.open({ filters: [{ name: t("images"), extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"] }] });
  if (!path) return;
  await call("set_cover", { id: book.id, path, bytes: null }).catch(fail);
  renderDetails();
}

async function removeBook(/** @type {Book} */ book) {
  const ok = await confirmAction(t("removeBook"), t("removeBookText", { title: book.title }), t("remove"));
  if (!ok) return;
  await call("remove_book", { id: book.id }).catch(fail);
  if (selected === book.id) selected = null;
  toast(t("removed", { title: book.title }));
  await refresh();
}

async function editBook(/** @type {Book} */ book) {
  const body = document.createElement("div");
  body.innerHTML = `
    <label class="field"><span>${t("title")}</span><input class="input" name="title"></label>
    <label class="field"><span>${t("authorsComma")}</span><input class="input" name="authors"></label>
    <div class="field"><span>${t("cover")}</span><div class="row-actions">
      <button class="btn" data-act="cover">${icon("image", 16)}${t("changeCover")}</button></div></div>`;
  /** @type {HTMLInputElement} */ (body.querySelector('[name="title"]')).value = book.title;
  /** @type {HTMLInputElement} */ (body.querySelector('[name="authors"]')).value = book.authors.join(", ");
  body.querySelector('[data-act="cover"]').addEventListener("click", () => chooseCover(book));
  const { action } = await dialog({ title: t("editDetails"), body, actions: [{ id: "save", label: t("save"), primary: true }] });
  if (action !== "save") return;
  const title = /** @type {HTMLInputElement} */ (body.querySelector('[name="title"]')).value;
  const authors = /** @type {HTMLInputElement} */ (body.querySelector('[name="authors"]')).value.split(",");
  try {
    await call("update_book", { id: book.id, title, authors });
    await refresh();
  } catch (e) {
    fail(e);
  }
}

// ---------- mini window ----------

const win = () => window.__TAURI__.window.getCurrentWindow();

export async function setMini(/** @type {boolean} */ on) {
  const was = document.body.dataset.mini === "1";
  if (was === on) return;
  document.body.dataset.mini = on ? "1" : "0";
  shelveRows();
  $("#mini-toggle").innerHTML = icon(on ? "expand" : "shrink");
  $("#mini-toggle").title = t(on ? "fullLibrary" : "miniMode");
  try {
    const w = win();
    const { LogicalSize } = window.__TAURI__.dpi;
    if (on) {
      const size = await w.innerSize();
      const scale = devicePixelRatio || 1;
      localStorage.setItem("vr-size", JSON.stringify([size.width / scale, size.height / scale]));
      await w.setMinSize(new LogicalSize(420, 300));
      await w.setSize(new LogicalSize(760, 340));
    } else {
      const [width, height] = JSON.parse(localStorage.getItem("vr-size") || "[1180, 800]");
      await w.setMinSize(new LogicalSize(640, 420));
      await w.setSize(new LogicalSize(Math.max(width, 900), Math.max(height, 600)));
    }
  } catch (e) {
    console.warn("window resize", e);
  }
}

export const toggleMini = () => setMini(document.body.dataset.mini !== "1");

// ---------- keyboard ----------

/** Arrow keys walk the spines, Enter opens, Delete removes, F2 edits. */
export function onKey(/** @type {KeyboardEvent} */ e) {
  const spines = [...document.querySelectorAll(document.body.dataset.mini === "1" ? ".recent .spine" : ".stack:not(.recent) .spine")];
  const ids = spines.map((s) => Number(/** @type {HTMLElement} */ (s).dataset.id));
  const at = ids.indexOf(selected ?? -1);
  const book = books.find((b) => b.id === selected);
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (step && ids.length) {
    const next = ids[Math.max(0, Math.min(ids.length - 1, at < 0 ? 0 : at + step))];
    selectBook(next);
    /** @type {HTMLElement} */ (spines[ids.indexOf(next)]).focus();
    return true;
  }
  if (!book) return false;
  if (e.key === "Escape" && home().dataset.card === "open" && !matchMedia("(min-width: 1181px)").matches) selectBook(null);
  else if (e.key === "Enter") onOpen(book.id);
  else if (e.key === "Delete") removeBook(book);
  else if (e.key === "F2") editBook(book);
  else return false;
  return true;
}

export function init() {
  const search = /** @type {HTMLInputElement} */ ($("#search"));
  search.addEventListener("input", () => {
    query = search.value;
    renderStacks();
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && visible()[0]) onOpen(visible()[0].id);
    if (e.key === "Escape") {
      search.value = query = "";
      search.blur();
      renderStacks();
    }
  });
  const lib = state.config.library;
  const groupOptions = ["shelf", "author", "format", "status", "none"].map((g) => ({ value: g, label: t(`group_${g}`) }));
  const sortOptions = ["recent", "title", "author", "progress", "added"].map((s) => ({ value: s, label: t(`sort_${s}`) }));
  const bindSelects = () => {
    select($("#group-by"), groupOptions, lib.group, (v) => ((lib.group = v), saveConfig(), bindSelects(), renderStacks()));
    select($("#sort-by"), sortOptions, lib.sort, (v) => ((lib.sort = v), saveConfig(), bindSelects(), renderStacks()));
  };
  bindSelects();
  $("#mini-toggle").addEventListener("click", toggleMini);
  new ResizeObserver(() => shelveRows()).observe($("#shelves"));
  const canvas = /** @type {HTMLCanvasElement} */ (globeBox.firstElementChild);
  canvas.setAttribute("aria-label", t("libraryGlobe"));
  globe.mount(canvas, { pick: selectBook, open: (id) => onOpen(id) });
  // A soft light follows the cursor over the room.
  const room = $("#room");
  let frame = 0;
  room.addEventListener("pointermove", (e) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const r = room.getBoundingClientRect();
      room.style.setProperty("--mx", `${e.clientX - r.left}px`);
      room.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });
  room.addEventListener("scroll", () => peek(null, room));
  paintIcons(home());
  commands.set("mini", { label: () => t("miniMode"), run: toggleMini, when: () => state.view === "home", key: "M" });
}
