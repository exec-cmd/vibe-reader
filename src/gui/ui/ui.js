// Shared interface pieces: icons, menus, dialogs, toasts, progress.

import { escapeHtml } from "./core.js";
import { t } from "./i18n.js";

/** 24×24 stroke icons drawn for vibe-reader. */
const PATHS = {
  menu: "M4 6h16M4 12h16M4 18h16",
  search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7",
  chevronDown: "M6 9l6 6 6-6",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  shrink: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4L10.7 6a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.5z",
  books: "M5 4h3v16H5zM10 4h3v16h-3zM15.5 5l2.9-.8 3.6 15-2.9.8z",
  shelf: "M3 20h18M5 20V8h3v12M10 20V5h3v15M15 20V10h3v10",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5",
  clock: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5l3 2",
  bookOpen: "M3 5.5C5.5 4.5 9 4.5 12 6.5c3-2 6.5-2 9-1v13c-2.5-1-6-1-9 1-3-2-6.5-2-9-1z M12 6.5v13",
  done: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM8 12.5l3 3 5-6",
  drop: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM8 16L16 8",
  circle: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  toc: "M4 6h2M9 6h11M4 12h2M9 12h11M4 18h2M9 18h11",
  notes: "M5 4h14v11l-5 5H5zM14 20v-5h5M8 9h8M8 13h5",
  bookmark: "M7 4h10v16l-5-4-5 4z",
  marker: "M15 4l5 5-9 9H6v-5zM4 21h9",
  pages: "M3 5h8v14H3zM13 5h8v14h-8z",
  page: "M7 3h10v18H7z",
  scroll: "M7 3h10v18H7zM12 7v5M10 10l2 2 2-2",
  zoomIn: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4M11 8v6M8 11h6",
  zoomOut: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4M8 11h6",
  fitWidth: "M4 4v16M20 4v16M8 12h8M8 12l2.5-2.5M8 12l2.5 2.5M16 12l-2.5-2.5M16 12l-2.5 2.5",
  fitPage: "M7 3h10v18H7zM10 9l2-2 2 2M10 15l2 2 2-2",
  fullscreen: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2 2.2.8-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  import: "M12 3v12M7 10l5 5 5-5M4 15v4h16v-4",
  folder: "M3 6h6l2 2h10v11H3z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01",
  command: "M9 6a3 3 0 1 0-3 3h3zM9 9h6v6H9zM15 6a3 3 0 1 1 3 3h-3zM9 18a3 3 0 1 1-3-3h3zM15 18a3 3 0 1 0 3-3h-3z",
  thumbs: "M4 4h6v7H4zM14 4h6v7h-6zM4 14h6v7H4zM14 14h6v7h-6z",
  back: "M10 6l-6 6 6 6M4 12h16",
  rotate: "M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4",
  copy: "M8 8h11v12H8zM5 16V4h11",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  sort: "M7 4v16M4 17l3 3 3-3M14 6h7M14 12h5M14 18h3",
  filter: "M4 5h16l-6 8v6l-4-2v-4z",
  agent: "M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM5 17l.8 2.2L8 20l-2.2.8L5 23",
  key: "M15 9a4 4 0 1 1-4 4 4 4 0 0 1 4-4zM12 12L3 21M6 18l2 2M8 16l2 2",
  info: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 11v6M12 7.5h.01",
  translate: "M4 5h9M8.5 3v2M6 5c.5 3 2.5 5.5 5 7M11 5c-.5 3-3 6.5-6.5 8.5M13 21l4-9 4 9M14.5 18h5",
  sound: "M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  soundOff: "M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6",
  pin: "M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  message: "M4 5h16v11H9l-5 4z",
  play: "M8 5l11 7-11 7z",
};

/** SVG markup for an icon. */
export function icon(/** @type {keyof typeof PATHS} */ name, size = 18) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[name] ?? ""}"/></svg>`;
}

/** Replaces every [data-icon] with its SVG (keeps any text after it). */
export function paintIcons(root = document) {
  for (const el of root.querySelectorAll("[data-icon]")) {
    if (el.querySelector(":scope > svg.icon")) continue;
    el.insertAdjacentHTML("afterbegin", icon(/** @type {any} */ (el.dataset.icon), Number(el.dataset.size || 18)));
  }
}

// ---------- menus ----------

/** @typedef {{ label?: string, icon?: string, hint?: string, checked?: boolean, danger?: boolean, disabled?: boolean,
 *   run?: () => void, items?: MenuItem[], separator?: boolean }} MenuItem */

let openMenus = [];

export function closeMenus() {
  for (const m of openMenus) m.remove();
  openMenus = [];
  removeEventListener("keydown", menuKeys, true);
}

function menuKeys(/** @type {KeyboardEvent} */ e) {
  const menu = openMenus.at(-1);
  if (!menu) return;
  const items = [...menu.querySelectorAll(".menu-item:not([disabled])")];
  const index = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  if (e.key === "Escape") {
    e.stopPropagation();
    e.preventDefault();
    const last = openMenus.pop();
    last?.remove();
    if (!openMenus.length) removeEventListener("keydown", menuKeys, true);
    return;
  }
  const move = { ArrowDown: 1, ArrowUp: -1 }[e.key];
  if (move) {
    e.preventDefault();
    e.stopPropagation();
    /** @type {HTMLElement} */ (items[(index + move + items.length) % items.length])?.focus();
  }
  if (e.key === "ArrowRight" && document.activeElement?.classList.contains("has-sub")) {
    e.preventDefault();
    /** @type {HTMLElement} */ (document.activeElement).click();
  }
  if (e.key === "ArrowLeft" && openMenus.length > 1) {
    e.preventDefault();
    openMenus.pop()?.remove();
  }
}

/**
 * Opens a menu next to an element or at a point.
 * @param {HTMLElement | {x: number, y: number}} at
 * @param {MenuItem[]} items
 * @param {{ nested?: boolean, align?: "start" | "end" }} [options]
 */
export function menu(at, items, options = {}) {
  if (!options.nested) closeMenus();
  const el = document.createElement("div");
  el.className = "menu";
  el.setAttribute("role", "menu");
  for (const item of items) {
    if (item.separator) {
      el.insertAdjacentHTML("beforeend", `<div class="menu-sep" role="separator"></div>`);
      continue;
    }
    const button = document.createElement("button");
    button.className = `menu-item${item.danger ? " danger" : ""}${item.items ? " has-sub" : ""}`;
    button.setAttribute("role", item.checked === undefined ? "menuitem" : "menuitemcheckbox");
    if (item.checked !== undefined) button.setAttribute("aria-checked", String(item.checked));
    button.disabled = !!item.disabled;
    button.innerHTML = `<span class="menu-mark">${item.checked ? icon("check", 15) : item.icon ? icon(/** @type {any} */ (item.icon), 15) : ""}</span>
      <span class="menu-label">${escapeHtml(item.label ?? "")}</span>
      <span class="menu-hint">${item.items ? icon("chevronRight", 14) : escapeHtml(item.hint ?? "")}</span>`;
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      if (item.items) {
        const r = button.getBoundingClientRect();
        while (openMenus.at(-1) !== el) openMenus.pop()?.remove();
        menu({ x: r.right - 4, y: r.top - 6 }, item.items, { nested: true });
        return;
      }
      closeMenus();
      item.run?.();
    });
    button.addEventListener("mouseenter", () => {
      button.focus();
      if (!item.items) while (openMenus.at(-1) !== el && openMenus.length) openMenus.pop()?.remove();
    });
    el.append(button);
  }
  document.body.append(el);
  const rect = el.getBoundingClientRect();
  let x, y;
  if (at instanceof HTMLElement) {
    const r = at.getBoundingClientRect();
    x = options.align === "end" ? r.right - rect.width : r.left;
    y = r.bottom + 4;
    if (y + rect.height > innerHeight - 8) y = r.top - rect.height - 4;
  } else {
    ({ x, y } = at);
    if (y + rect.height > innerHeight - 8) y = Math.max(8, innerHeight - rect.height - 8);
  }
  if (x + rect.width > innerWidth - 8) x = options.nested && !(at instanceof HTMLElement) ? at.x - rect.width * 2 + 8 : innerWidth - rect.width - 8;
  el.style.left = `${Math.max(8, x)}px`;
  el.style.top = `${Math.max(8, y)}px`;
  openMenus.push(el);
  if (openMenus.length === 1) addEventListener("keydown", menuKeys, true);
  /** @type {HTMLElement | null} */ (el.querySelector(".menu-item:not([disabled])"))?.focus();
  return el;
}

addEventListener("mousedown", (e) => {
  if (!(/** @type {Element} */ (e.target).closest(".menu"))) closeMenus();
});
addEventListener("blur", closeMenus);

/**
 * A dropdown that shows the current choice and changes it.
 * @param {HTMLElement} button
 * @param {{value: string, label: string}[]} options
 * @param {string} value
 * @param {(value: string) => void} onChange
 */
export function select(button, options, value, onChange) {
  const label = button.querySelector(".select-value");
  if (label) label.textContent = options.find((o) => o.value === value)?.label ?? "";
  button.onclick = () =>
    menu(button, options.map((o) => ({ label: o.label, checked: o.value === value, run: () => onChange(o.value) })));
}

// ---------- dialogs ----------

/**
 * Shows a modal dialog. Resolves with the id of the pressed action, or null on cancel.
 * @param {{ title: string, body?: string | HTMLElement, actions?: {id: string, label: string, primary?: boolean, danger?: boolean}[], wide?: boolean }} spec
 * @param {(root: HTMLElement) => void} [setup]
 * @returns {Promise<{action: string | null, root: HTMLElement}>}
 */
export function dialog(spec, setup) {
  return new Promise((resolve) => {
    const shade = document.createElement("div");
    shade.className = "shade";
    const box = document.createElement("div");
    box.className = `dialog${spec.wide ? " wide" : ""}`;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.innerHTML = `<h2 class="dialog-title"></h2><div class="dialog-body"></div><div class="dialog-actions"></div>`;
    box.querySelector(".dialog-title").textContent = spec.title;
    const body = box.querySelector(".dialog-body");
    if (typeof spec.body === "string") body.innerHTML = spec.body;
    else if (spec.body) body.append(spec.body);
    const actions = spec.actions ?? [{ id: "ok", label: t("ok"), primary: true }];
    const done = (/** @type {string | null} */ action) => {
      shade.remove();
      removeEventListener("keydown", keys, true);
      resolve({ action, root: box });
    };
    for (const a of [{ id: null, label: t("cancel") }, ...actions]) {
      const b = document.createElement("button");
      b.className = `btn${a.primary ? " primary" : ""}${a.danger ? " danger" : ""}`;
      b.textContent = a.label;
      b.addEventListener("click", () => done(a.id));
      box.querySelector(".dialog-actions").append(b);
    }
    const keys = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        done(null);
      }
      if (e.key === "Enter" && !(/** @type {Element} */ (e.target).closest("textarea"))) {
        e.preventDefault();
        e.stopPropagation();
        done(actions.find((a) => a.primary)?.id ?? actions[0].id);
      }
    };
    addEventListener("keydown", keys, true);
    shade.addEventListener("mousedown", (e) => e.target === shade && done(null));
    shade.append(box);
    document.body.append(shade);
    setup?.(box);
    /** @type {HTMLElement | null} */ (box.querySelector("input, textarea, select, .btn.primary"))?.focus();
  });
}

export async function confirmAction(/** @type {string} */ title, /** @type {string} */ text, /** @type {string} */ label, danger = true) {
  const { action } = await dialog({ title, body: `<p>${escapeHtml(text)}</p>`, actions: [{ id: "ok", label, primary: !danger, danger }] });
  return action === "ok";
}

/** Asks for one line of text. */
export async function ask(/** @type {string} */ title, /** @type {string} */ label, value = "") {
  const { action, root } = await dialog(
    { title, body: `<label class="field"><span>${escapeHtml(label)}</span><input class="input" type="text"></label>`, actions: [{ id: "ok", label: t("save"), primary: true }] },
    (root) => {
      const input = /** @type {HTMLInputElement} */ (root.querySelector("input"));
      input.value = value;
      setTimeout(() => input.select(), 0);
    },
  );
  const text = /** @type {HTMLInputElement} */ (root.querySelector("input")).value.trim();
  return action === "ok" && text ? text : null;
}

// ---------- toasts and progress ----------

let toastTimer = 0;
export function toast(/** @type {string} */ text, /** @type {{ action?: string, run?: () => void }} */ opts = {}) {
  let el = document.getElementById("toast");
  el.innerHTML = `<span></span>${opts.action ? `<button class="btn quiet"></button>` : ""}`;
  el.firstElementChild.textContent = text;
  if (opts.action) {
    const b = el.querySelector("button");
    b.textContent = opts.action;
    b.onclick = () => {
      el.hidden = true;
      opts.run?.();
    };
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), opts.action ? 6000 : 2600);
}

/** Shows or updates the progress strip at the bottom; null hides it. */
export function progress(/** @type {{label: string, done: number, total: number} | null} */ p) {
  const el = document.getElementById("progress-strip");
  if (!p) return void (el.hidden = true);
  el.hidden = false;
  el.querySelector(".progress-label").textContent = p.label;
  /** @type {HTMLElement} */ (el.querySelector(".progress-bar > i")).style.width = `${p.total ? (100 * p.done) / p.total : 0}%`;
}
