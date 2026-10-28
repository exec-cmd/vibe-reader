// Reflow engine for EPUB, FB2, Markdown, TXT and HTML: a chapter laid out on a full-height
// sheet, as two facing sheets (spread) or as one long scroll.

import { call } from "./core.js";
import { enhance } from "./enhance.js";
import { offsetOf, rangeOf } from "./offsets.js";

export class FlowEngine {
  /**
   * @param {{ page: HTMLElement, frame: HTMLElement, viewport: HTMLElement, layout: string,
   *   onPage: () => void, decorate: (index: number, offset: number) => Promise<void> }} opts
   */
  constructor(opts) {
    this.opts = opts;
    this.page = opts.page;
    this.frame = opts.frame;
    this.viewport = opts.viewport;
    this.layout = opts.layout;
    this.chapter = -1;
    this.pageIndex = 0;
    this.pages = 1;
    this.step = 1;
    this.columnWidth = 0;
    this.gap = 0;
    this.chapters = 0;
  }

  async open(/** @type {number} */ chapters, /** @type {{chapter: number, offset: number}} */ at) {
    this.chapters = chapters;
    await this.load(Math.min(at.chapter, chapters - 1), { offset: at.offset });
  }

  destroy() {
    this.page.removeAttribute("style");
    this.frame.removeAttribute("style");
  }

  /** @param {number} index @param {{offset?: number, atEnd?: boolean, anchor?: string | null}} [where] */
  async load(index, where = {}) {
    if (index < 0 || index >= this.chapters) return false;
    const view = await call("chapter", { index });
    this.chapter = index;
    this.page.style.transform = "";
    this.page.innerHTML = view.html;
    enhance(this.page);
    await this.opts.decorate(index, where.offset ?? 0);
    this.relayout();
    if (where.anchor) {
      const target = this.page.querySelector(`#${CSS.escape(where.anchor)}`);
      if (target) this.showElement(target);
    } else if (where.atEnd) {
      this.goPage(this.pages - 1);
    } else if (where.offset) {
      this.showOffset(where.offset);
    } else {
      this.goPage(0);
      this.viewport.scrollTop = 0;
    }
    return true;
  }

  /** Recomputes the sheet and its columns for the current layout and window size. */
  relayout() {
    const p = this.page;
    const f = this.frame;
    this.frame.dataset.layout = this.layout;
    if (this.layout === "scroll") {
      p.style.cssText = "";
      f.style.cssText = "";
      this.pages = 1;
      return;
    }
    const vp = this.viewport;
    const em = parseFloat(getComputedStyle(p).fontSize);
    const measure = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--measure")) * em || 34 * em;
    const pad = Math.round(Math.max(28, Math.min(64, vp.clientWidth * 0.045)));
    const spread = this.layout === "spread" && vp.clientWidth >= 2 * Math.min(measure, 22 * em) + 6 * pad;
    const n = spread ? 2 : 1;
    const available = (vp.clientWidth - 48 - 2 * pad * n) / n;
    this.columnWidth = Math.floor(Math.max(16 * em, Math.min(measure, available)));
    this.gap = 2 * pad;
    const width = n * this.columnWidth + (n - 1) * this.gap;
    const height = vp.clientHeight - 40;
    f.style.width = `${width + 2 * pad}px`;
    f.style.height = `${height}px`;
    f.style.padding = `${Math.round(pad * 0.75)}px ${pad}px`;
    f.dataset.spread = String(spread);
    p.style.width = `${width}px`;
    p.style.height = `${height - 2 * Math.round(pad * 0.75)}px`;
    p.style.columnWidth = `${this.columnWidth}px`;
    p.style.columnGap = `${this.gap}px`;
    this.step = width + this.gap;
    this.pages = Math.max(1, Math.round((p.scrollWidth + this.gap) / this.step));
    this.goPage(Math.min(this.pageIndex, this.pages - 1));
  }

  goPage(/** @type {number} */ n) {
    if (this.layout === "scroll") return;
    this.pageIndex = Math.max(0, Math.min(this.pages - 1, n));
    this.page.style.transform = `translateX(${-this.pageIndex * this.step}px)`;
    this.opts.onPage();
  }

  async next() {
    if (this.layout !== "scroll" && this.pageIndex < this.pages - 1) return this.goPage(this.pageIndex + 1);
    if (this.layout === "scroll") {
      const vp = this.viewport;
      if (vp.scrollTop + vp.clientHeight < vp.scrollHeight - 4) return vp.scrollBy({ top: vp.clientHeight * 0.88, behavior: "smooth" });
    }
    return this.load(this.chapter + 1);
  }

  async prev() {
    if (this.layout !== "scroll" && this.pageIndex > 0) return this.goPage(this.pageIndex - 1);
    if (this.layout === "scroll" && this.viewport.scrollTop > 0) return this.viewport.scrollBy({ top: -this.viewport.clientHeight * 0.88, behavior: "smooth" });
    return this.load(this.chapter - 1, { atEnd: true });
  }

  setLayout(/** @type {string} */ layout) {
    const offset = this.visibleOffset();
    this.layout = layout;
    this.relayout();
    this.showOffset(offset);
  }

  relayoutKeepingPlace() {
    const offset = this.visibleOffset();
    this.relayout();
    this.showOffset(offset);
  }

  /** Brings a chapter offset into view. */
  showOffset(/** @type {number} */ offset) {
    const range = rangeOf(this.page, offset, offset + 1);
    if (!range) return;
    const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
    if (this.layout === "scroll") this.viewport.scrollTop += rect.top - this.viewport.getBoundingClientRect().top - 60;
    else this.goPage(Math.floor((rect.left - this.page.getBoundingClientRect().left + 1) / this.step));
  }

  showElement(/** @type {Element} */ el) {
    if (this.layout === "scroll") el.scrollIntoView({ block: "start" });
    else this.goPage(Math.floor((el.getBoundingClientRect().left - this.page.getBoundingClientRect().left + 1) / this.step));
  }

  /** Offset of the first character visible at the top of the sheet. */
  visibleOffset() {
    const p = this.page;
    const pr = p.getBoundingClientRect();
    const vr = this.viewport.getBoundingClientRect();
    const x = this.layout === "scroll" ? pr.left + 2 : pr.left + this.pageIndex * this.step + 2;
    const top = Math.max(vr.top + 8, pr.top) + 4;
    for (let y = top; y < top + 120; y += 12) {
      const hit = document.caretRangeFromPoint?.(x + 8, y);
      if (hit && p.contains(hit.startContainer)) return offsetOf(p, hit.startContainer, hit.startOffset);
    }
    for (const el of p.querySelectorAll("[data-o]")) {
      const r = el.getBoundingClientRect();
      if (this.layout === "scroll" ? r.bottom >= top : r.left >= x - 4) return Number(/** @type {HTMLElement} */ (el).dataset.o);
    }
    return 0;
  }

  position() {
    return { chapter: this.chapter, offset: this.visibleOffset() };
  }

  /** Pager text: the page within the chapter. */
  label() {
    return this.layout === "scroll" ? "" : String(this.pageIndex + 1);
  }

  total() {
    return this.layout === "scroll" ? "" : String(this.pages);
  }

  selection() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !this.page.contains(sel.anchorNode)) return null;
    const r = sel.getRangeAt(0);
    const start = offsetOf(this.page, r.startContainer, r.startOffset);
    const end = offsetOf(this.page, r.endContainer, r.endOffset);
    return end > start ? { chapter: this.chapter, start, end, text: sel.toString(), rect: r.getBoundingClientRect() } : null;
  }

  range(/** @type {number} */ chapter, /** @type {number} */ start, /** @type {number} */ end) {
    return chapter === this.chapter ? rangeOf(this.page, start, end) : null;
  }

  /** Column left edge (relative to the page box) for a rect; note marks sit in its margin. */
  columnLeft(/** @type {DOMRect} */ rect) {
    if (this.layout === "scroll") return 0;
    const pr = this.page.getBoundingClientRect();
    const col = this.columnWidth + this.gap;
    return Math.floor((rect.left - pr.left) / col) * col;
  }
}
