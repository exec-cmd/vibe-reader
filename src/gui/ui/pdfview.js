// PDF engine: pages drawn by pdf.js with a text layer for selection, notes and search.
// Layouts: one page, a two-page spread (the first page alone, like a printed book) or a scroll.
// Locators: chapter = page index, offset = position in the page's text-layer text (see offsets.js).
//
// Security: pdf.js runs without eval, XFA forms or document scripts, and no annotation layer is
// built, so links and actions embedded in a PDF do nothing.

import { normalize, offsetOf, rangeOf } from "./offsets.js";
import { loadPdfjs } from "./pdfcover.js";

const GAP = 18;
const PAD = 24;
/** CSS pixels per PDF point at 100 %. */
const UNIT = 96 / 72;

/** @typedef {{ start: number, end: number, kind: string, author: string, quote: string, id: number, body: string }} PageMark */

export class PdfEngine {
  /** @param {HTMLElement} container @param {HTMLElement} viewport @param {{layout: string, fit: string, invert: boolean, onPage: (i: number) => void, onPaint: (page: number, layer: HTMLElement) => void}} opts */
  constructor(container, viewport, opts) {
    this.container = container;
    this.viewport = viewport;
    this.opts = opts;
    this.layout = opts.layout;
    /** `page`, `width` or a percentage. */
    this.fit = opts.fit;
    this.page = 0;
    this.doc = null;
    /** @type {{width: number, height: number}[]} */
    this.sizes = [];
    /** @type {Map<number, string>} */
    this.texts = new Map();
    this.renderToken = 0;
    /** @type {IntersectionObserver | null} */
    this.observer = null;
  }

  async open(/** @type {number} */ start) {
    const pdfjs = await loadPdfjs();
    this.pdfjs = pdfjs;
    this.doc = await pdfjs.getDocument({ url: "/book", isEvalSupported: false, enableXfa: false, disableAutoFetch: false }).promise;
    const first = await this.doc.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    // Pages are usually the same size; sizes of others are filled in when drawn.
    this.sizes = Array.from({ length: this.doc.numPages }, () => ({ width: vp.width, height: vp.height }));
    this.page = Math.max(0, Math.min(this.pages - 1, start));
    await this.render();
  }

  get pages() {
    return this.doc?.numPages ?? 0;
  }

  destroy() {
    this.observer?.disconnect();
    this.doc?.destroy();
    this.doc = null;
  }

  // ---------- geometry ----------

  /** Pages shown together in the spread layout: [0], [1, 2], [3, 4], … */
  spreadOf(/** @type {number} */ i) {
    // A spread needs a landscape window; a tall narrow one shows single pages.
    const wide = this.viewport.clientWidth > this.viewport.clientHeight * 1.05;
    if (this.layout !== "spread" || !wide || i === 0) return [i];
    const left = i % 2 === 1 ? i : i - 1;
    return left + 1 < this.pages ? [left, left + 1] : [left];
  }

  scaleFor(/** @type {number[]} */ group) {
    // The frame pads by PAD; a little more keeps scrollbars from appearing at exact fit.
    const w = this.viewport.clientWidth - 2 * PAD - 12;
    const h = this.viewport.clientHeight - 2 * PAD - 4;
    const width = group.reduce((s, i) => s + this.sizes[i].width, 0) + GAP * (group.length - 1);
    const height = Math.max(...group.map((i) => this.sizes[i].height));
    if (typeof this.fit === "number") return (this.fit / 100) * UNIT;
    if (this.fit === "width" || this.layout === "scroll" && this.fit !== "page") return w / width;
    return Math.min(w / width, h / height);
  }

  zoomPercent() {
    return Math.round((this.scaleFor(this.spreadOf(this.page)) / UNIT) * 100);
  }

  setZoom(/** @type {string | number} */ fit) {
    this.fit = typeof fit === "number" ? Math.max(25, Math.min(500, fit)) : fit;
    return this.render();
  }

  zoomBy(/** @type {number} */ step) {
    const now = this.zoomPercent();
    const levels = [25, 33, 50, 67, 75, 85, 100, 115, 125, 150, 175, 200, 250, 300, 400, 500];
    const next = step > 0 ? levels.find((l) => l > now) ?? 500 : [...levels].reverse().find((l) => l < now) ?? 25;
    return this.setZoom(next);
  }

  setLayout(/** @type {string} */ layout) {
    this.layout = layout;
    return this.render();
  }

  // ---------- drawing ----------

  async render() {
    const token = ++this.renderToken;
    this.observer?.disconnect();
    this.container.replaceChildren();
    this.container.dataset.layout = this.layout;
    if (this.layout === "scroll") return this.renderScroll(token);
    const group = this.spreadOf(this.page);
    const scale = this.scaleFor(group);
    const row = document.createElement("div");
    row.className = "pdf-spread";
    for (const i of group) row.append(this.holder(i, scale));
    this.container.append(row);
    this.viewport.scrollTo({ top: 0, left: 0 });
    await Promise.all([...row.children].map((h) => this.draw(/** @type {HTMLElement} */ (h), token)));
    // Draw the next spread in the background so turning the page is instant.
    const next = this.spreadOf(group.at(-1) + 1);
    if (group.at(-1) + 1 < this.pages) next.forEach((i) => this.doc?.getPage(i + 1));
  }

  renderScroll(/** @type {number} */ token) {
    const scale = this.scaleFor([this.page]);
    const column = document.createElement("div");
    column.className = "pdf-column";
    for (let i = 0; i < this.pages; i++) column.append(this.holder(i, scale));
    this.container.append(column);
    const drawn = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) this.draw(/** @type {HTMLElement} */ (e.target), token);
    }, { root: this.viewport, rootMargin: "1200px 0px" });
    const current = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          this.page = Number(/** @type {HTMLElement} */ (e.target).dataset.page);
          this.opts.onPage(this.page);
        }
      }
    }, { root: this.viewport, rootMargin: "-45% 0px -50% 0px" });
    for (const h of column.children) {
      drawn.observe(h);
      current.observe(h);
    }
    this.observer = { disconnect: () => (drawn.disconnect(), current.disconnect()) };
    /** @type {HTMLElement} */ (column.children[this.page])?.scrollIntoView({ block: "start" });
  }

  holder(/** @type {number} */ i, /** @type {number} */ scale) {
    const h = document.createElement("div");
    h.className = "pdf-page";
    h.dataset.page = String(i);
    h.dataset.scale = String(scale);
    h.style.width = `${this.sizes[i].width * scale}px`;
    h.style.height = `${this.sizes[i].height * scale}px`;
    h.classList.toggle("invert", this.opts.invert);
    return h;
  }

  async draw(/** @type {HTMLElement} */ holder, /** @type {number} */ token) {
    if (holder.dataset.drawn || !this.doc) return;
    holder.dataset.drawn = "1";
    const i = Number(holder.dataset.page);
    const scale = Number(holder.dataset.scale);
    const page = await this.doc.getPage(i + 1);
    if (token !== this.renderToken) return;
    const base = page.getViewport({ scale: 1 });
    if (base.width !== this.sizes[i].width || base.height !== this.sizes[i].height) {
      this.sizes[i] = { width: base.width, height: base.height };
    }
    const vp = page.getViewport({ scale });
    holder.style.width = `${vp.width}px`;
    holder.style.height = `${vp.height}px`;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    holder.append(canvas);
    const layer = document.createElement("div");
    layer.className = "textLayer";
    // The text layer is the "chapter" whose offsets locators count in.
    layer.dataset.o = "0";
    layer.style.setProperty("--scale-factor", String(scale));
    layer.style.setProperty("--total-scale-factor", String(scale));
    holder.append(layer);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: scale * dpr }) }).promise.catch(() => {});
    if (token !== this.renderToken) return;
    const text = await page.getTextContent();
    this.texts.set(i, pageText(text));
    await new this.pdfjs.TextLayer({ textContentSource: text, container: layer, viewport: vp }).render().catch(() => {});
    this.opts.onPaint(i, layer);
  }

  invert(/** @type {boolean} */ on) {
    this.opts.invert = on;
    for (const h of this.container.querySelectorAll(".pdf-page")) h.classList.toggle("invert", on);
  }

  // ---------- navigation ----------

  async go(/** @type {number} */ i) {
    i = Math.max(0, Math.min(this.pages - 1, i));
    if (this.layout === "scroll") {
      this.page = i;
      /** @type {HTMLElement | null} */ (this.container.querySelector(`.pdf-page[data-page="${i}"]`))?.scrollIntoView({ block: "start" });
      this.opts.onPage(i);
      return;
    }
    const same = this.spreadOf(i).includes(this.page);
    this.page = i;
    if (!same) await this.render();
    this.opts.onPage(i);
  }

  next() {
    if (this.layout === "scroll") return this.scrollScreen(1);
    if (this.canScroll(1)) return this.scrollScreen(1);
    return this.go(this.spreadOf(this.page).at(-1) + 1);
  }

  prev() {
    if (this.layout === "scroll") return this.scrollScreen(-1);
    if (this.canScroll(-1)) return this.scrollScreen(-1);
    const prev = this.spreadOf(this.page)[0] - 1;
    return prev >= 0 ? this.go(this.spreadOf(prev)[0]) : undefined;
  }

  /** Zoomed-in pages scroll before turning. */
  canScroll(/** @type {number} */ dir) {
    const v = this.viewport;
    return dir > 0 ? v.scrollTop + v.clientHeight < v.scrollHeight - 4 : v.scrollTop > 4;
  }

  scrollScreen(/** @type {number} */ dir) {
    this.viewport.scrollBy({ top: dir * this.viewport.clientHeight * 0.88, behavior: "smooth" });
  }

  /** The page label for the pager: "12" or "12–13". */
  label() {
    const g = this.layout === "scroll" ? [this.page] : this.spreadOf(this.page);
    return g.length > 1 ? `${g[0] + 1}–${g[1] + 1}` : String(g[0] + 1);
  }

  // ---------- text ----------

  /** Normalized text of a page, from the cache or pdf.js. */
  async text(/** @type {number} */ i) {
    if (!this.texts.has(i)) {
      const page = await this.doc.getPage(i + 1);
      this.texts.set(i, pageText(await page.getTextContent()));
    }
    return this.texts.get(i);
  }

  /** Finds a query in every page, reporting results page by page. Returns a cancel function. */
  search(/** @type {string} */ query, /** @type {(hits: {chapter: number, offset: number, length: number, snippet: string}[], done: boolean) => void} */ report) {
    let cancelled = false;
    const q = query.toLowerCase();
    (async () => {
      for (let i = 0; i < this.pages && !cancelled; i++) {
        const text = await this.text(i);
        const lower = text.toLowerCase();
        const hits = [];
        for (let at = lower.indexOf(q); at >= 0 && q; at = lower.indexOf(q, at + q.length)) {
          hits.push({ chapter: i, offset: [...text.slice(0, at)].length, length: [...query].length, snippet: snippet(text, at, q.length) });
        }
        if (!cancelled) report(hits, i === this.pages - 1);
      }
    })();
    return () => (cancelled = true);
  }

  /** The text layer of a drawn page. */
  layer(/** @type {number} */ i) {
    return /** @type {HTMLElement | null} */ (this.container.querySelector(`.pdf-page[data-page="${i}"] .textLayer`));
  }

  /** Selection inside one page as offsets in that page's text. */
  selection() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const holder = /** @type {HTMLElement | null} */ (range.startContainer.parentElement?.closest(".pdf-page"));
    if (!holder || !this.container.contains(holder)) return null;
    const page = Number(holder.dataset.page);
    const layer = this.layer(page);
    const endInside = layer.contains(range.endContainer);
    const start = offsetOf(layer, range.startContainer, range.startOffset);
    const end = endInside ? offsetOf(layer, range.endContainer, range.endOffset) : [...(this.texts.get(page) ?? "")].length;
    if (end <= start) return null;
    const text = [...(this.texts.get(page) ?? sel.toString())].slice(start, end).join("");
    return { chapter: page, start, end, text, rect: range.getBoundingClientRect() };
  }

  /** A DOM range for an offset span on a drawn page. */
  range(/** @type {number} */ page, /** @type {number} */ start, /** @type {number} */ end) {
    const layer = this.layer(page);
    return layer ? rangeOf(layer, start, end) : null;
  }

  /** Outline (bookmarks) with page indexes resolved. */
  async outline() {
    const items = (await this.doc.getOutline()) ?? [];
    const resolve = async (/** @type {any[]} */ list, level) => {
      const out = [];
      for (const item of list) {
        let page = null;
        try {
          const dest = typeof item.dest === "string" ? await this.doc.getDestination(item.dest) : item.dest;
          if (dest?.[0]) page = typeof dest[0] === "number" ? dest[0] : await this.doc.getPageIndex(dest[0]);
        } catch {}
        out.push({ title: item.title, level, page });
        if (item.items?.length) out.push(...(await resolve(item.items, level + 1)));
      }
      return out;
    };
    return resolve(items, 0);
  }

  /** Draws a small page image into a canvas for the thumbnails panel. */
  async thumb(/** @type {number} */ i, /** @type {HTMLCanvasElement} */ canvas, width = 120) {
    const page = await this.doc.getPage(i + 1);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: (width * Math.min(devicePixelRatio || 1, 2)) / base.width });
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise.catch(() => {});
  }
}

/** Page text as the text layer shows it: text items, with a line break after `hasEOL` items. */
function pageText(/** @type {{items: any[]}} */ content) {
  const pieces = [];
  for (const item of content.items) {
    if (typeof item.str !== "string") continue;
    if (item.str) pieces.push(item.str);
    if (item.hasEOL) pieces.push({ br: true });
  }
  return normalize(pieces);
}

function snippet(/** @type {string} */ text, /** @type {number} */ at, /** @type {number} */ len) {
  const from = Math.max(0, at - 50);
  return `${from > 0 ? "…" : ""}${text.slice(from, at + len + 60).replace(/\n/g, " ")}`;
}
