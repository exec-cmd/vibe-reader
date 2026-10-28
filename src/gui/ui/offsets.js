// Character offsets in a chapter's normalized text, mirrored from src/core/src/text.rs.
// The core stamps every block element with data-o (its starting offset); here we replay the
// same rules from the nearest stamped block to a DOM point, and back.

const BLOCKS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "CAPTION", "DD", "DETAILS", "DIV", "DL", "DT",
  "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HGROUP",
  "HR", "LI", "NAV", "OL", "P", "PRE", "SECTION", "SUMMARY", "TABLE", "TBODY", "TD", "TFOOT",
  "TH", "THEAD", "TR", "UL",
]);
const SPACE = new Set([" ", "\t", "\n", "\r", "\f"]);

/** Thrown to stop a walk early. */
const STOP = Symbol("stop");

/**
 * Replays normalization from a stamped block. `onChar(node, index, offset)` runs before each
 * emitted character of a text node; `onNode(node)` runs when a node is entered.
 */
class Walker {
  /** @param {number} start */
  constructor(start) {
    this.len = start;
    this.last = "\n"; // a stamped block always begins a line
    this.pending = false;
    this.need = false;
    /** @type {(node: Text, index: number, offset: number) => void} */
    this.onChar = () => {};
    /** @type {(node: Node) => void} */
    this.onNode = () => {};
  }

  emit(ch) {
    this.len += 1;
    this.last = ch;
  }

  startBlock() {
    if (this.last !== "\n") this.emit("\n");
    this.pending = false;
    this.need = false;
  }

  /** @param {Text} node @param {string} text @param {boolean} pre */
  text(node, text, pre) {
    let index = 0;
    for (const ch of text) {
      const here = index;
      index += ch.length;
      if (!pre && SPACE.has(ch)) {
        this.pending = true;
        continue;
      }
      if (this.need) this.startBlock();
      if (this.pending && this.last !== " " && this.last !== "\n") this.emit(" ");
      this.pending = false;
      if (node) this.onChar(node, here, this.len);
      this.emit(ch);
    }
  }

  /** @param {Node} node @param {boolean} pre @param {boolean} first */
  walk(node, pre, first = false) {
    this.onNode(node);
    if (node.nodeType === Node.TEXT_NODE) {
      this.text(/** @type {Text} */ (node), node.data, pre);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = /** @type {HTMLElement} */ (node);
    if (el.dataset.skip !== undefined) return;
    if (el.tagName === "BR") {
      this.need = true;
      return;
    }
    // KaTeX replaces the TeX source; count the source the core counted.
    if (el.dataset.tex !== undefined) {
      this.text(null, el.dataset.tex, pre);
      return;
    }
    // UI wrappers (data-wrap) are not part of the book and do not start lines.
    const block = BLOCKS.has(el.tagName) && el.dataset.wrap === undefined;
    if (block && !first) this.startBlock();
    const inPre = pre || el.tagName === "PRE";
    for (const child of el.childNodes) this.walk(child, inPre);
    if (block) this.need = true;
  }
}

/** Elements with data-o, in document order, the root included (a PDF text layer is one block). @param {Element} root */
function stamped(root) {
  const own = root.matches("[data-o]") ? [root] : [];
  return /** @type {HTMLElement[]} */ ([...own, ...root.querySelectorAll("[data-o]")]);
}

/** Runs a walker from `block` through the rest of the chapter in document order. */
function walkFrom(root, block, walker) {
  const pre = !!block.parentElement?.closest("pre");
  walker.walk(block, pre, true);
  // Continue with following siblings and ancestors' siblings until the root.
  let node = block;
  while (node && node !== root) {
    for (let next = node.nextSibling; next; next = next.nextSibling) walker.walk(next, pre);
    node = node.parentNode;
    if (node && node !== root && BLOCKS.has(/** @type {Element} */ (node).tagName)) walker.need = true;
  }
}

/** Last stamped block that starts before the DOM point. */
function blockBefore(root, node, offset) {
  const range = document.createRange();
  range.setStart(node, offset);
  let found = null;
  for (const el of stamped(root)) {
    if (range.comparePoint(el, 0) > 0) break;
    found = el;
  }
  return found;
}

/**
 * Offset of a DOM point (as in a Range boundary) inside `root`.
 * @param {Element} root @param {Node} node @param {number} offset
 */
export function offsetOf(root, node, offset) {
  const block = blockBefore(root, node, offset);
  if (!block) return 0;
  const walker = new Walker(Number(block.dataset.o));
  // An element boundary points before its child at `offset`.
  const target = node.nodeType === Node.TEXT_NODE ? node : node.childNodes[offset] ?? null;
  walker.onNode = (n) => {
    if (n === target && n !== node) throw STOP;
  };
  walker.onChar = (n, index, at) => {
    if (n === node && index >= offset) throw STOP;
  };
  try {
    walkFrom(root, block, walker);
  } catch (e) {
    if (e !== STOP) throw e;
    // A collapsed space before the point is emitted lazily; count it if it would be next.
    return walker.len + (walker.pending && walker.last !== " " && walker.last !== "\n" ? 1 : 0);
  }
  return walker.len;
}

/**
 * DOM point for an offset inside `root`, or null when it is past the rendered text.
 * @param {Element} root @param {number} target
 * @returns {{node: Text, offset: number} | null}
 */
export function pointAt(root, target) {
  let block = null;
  for (const el of stamped(root)) {
    if (Number(el.dataset.o) > target) break;
    block = el;
  }
  if (!block) return null;
  const walker = new Walker(Number(block.dataset.o));
  let point = null;
  let lastText = null;
  walker.onChar = (n, index, at) => {
    lastText = { node: n, offset: index + 1 };
    if (at >= target) {
      point = { node: n, offset: index };
      throw STOP;
    }
  };
  try {
    walkFrom(root, block, walker);
  } catch (e) {
    if (e !== STOP) throw e;
  }
  return point ?? lastText;
}

/** @param {Element} root @param {number} start @param {number} end */
export function rangeOf(root, start, end) {
  const a = pointAt(root, start);
  const b = pointAt(root, Math.max(start, end));
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

/**
 * Normalized text of a sequence of text pieces and line breaks, by the same rules as the DOM walk.
 * Used for PDF pages, whose text layer is built from these pieces.
 * @param {(string | {br: true})[]} pieces
 */
export function normalize(pieces) {
  let out = "";
  const walker = new Walker(0);
  walker.emit = (ch) => {
    walker.len += 1;
    walker.last = ch;
    out += ch;
  };
  for (const p of pieces) {
    if (typeof p === "string") walker.text(null, p, false);
    else walker.need = true;
  }
  return out;
}
