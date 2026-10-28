// Ctrl+K: commands and books in one list.

import { $, commands } from "./core.js";
import { t } from "./i18n.js";
import { allBooks, onOpen } from "./library.js";

/** @type {{label: string, hint: string, run: () => void}[]} */
let items = [];
let selected = 0;

const box = () => $("#palette");
const input = () => /** @type {HTMLInputElement} */ ($("#palette-input"));

export const isOpen = () => !box().hidden;

export function open() {
  box().hidden = false;
  input().value = "";
  render();
  input().focus();
}

export function close() {
  box().hidden = true;
}

function render() {
  const q = input().value.trim().toLowerCase();
  const fromCommands = [...commands.values()]
    .filter((c) => !c.when || c.when())
    .map((c) => ({ label: c.label(), hint: c.key ?? "", run: c.run }));
  const fromBooks = allBooks().map((b) => ({ label: b.title, hint: t("openBook"), run: () => onOpen(b.id) }));
  items = [...fromCommands, ...fromBooks].filter((i) => !q || i.label.toLowerCase().includes(q)).slice(0, 40);
  selected = Math.min(selected, Math.max(0, items.length - 1));
  const list = $("#palette-list");
  list.replaceChildren(
    ...items.map((item, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === selected));
      li.innerHTML = `<span></span><small></small>`;
      li.firstElementChild.textContent = item.label;
      li.lastElementChild.textContent = item.hint;
      li.addEventListener("click", () => run(i));
      return li;
    }),
  );
}

function run(/** @type {number} */ i) {
  const item = items[i];
  close();
  item?.run();
}

export function init() {
  input().addEventListener("input", () => ((selected = 0), render()));
  input().addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") selected = Math.min(items.length - 1, selected + 1);
    else if (e.key === "ArrowUp") selected = Math.max(0, selected - 1);
    else if (e.key === "Enter") return run(selected);
    else if (e.key === "Escape") return close();
    else return;
    e.preventDefault();
    render();
  });
  box().addEventListener("click", (e) => e.target === box() && close());
}
