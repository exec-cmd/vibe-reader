// Turns sanitized chapter HTML into a readable page: code highlighting, copy buttons,
// formulas, scrollable tables and zoomable images. Every added node is data-skip or
// data-wrap so offsets.js keeps counting the book's own text.

import { t } from "./i18n.js";
import { toast } from "./core.js";

/** @param {HTMLElement} root */
export function enhance(root) {
  for (const code of root.querySelectorAll("pre code")) {
    const lang = [...code.classList].find((c) => c.startsWith("language-"))?.slice(9);
    if (window.hljs && (!lang || window.hljs.getLanguage(lang))) {
      const result = lang ? window.hljs.highlight(code.textContent, { language: lang }) : window.hljs.highlightAuto(code.textContent);
      code.innerHTML = result.value;
    }
  }
  for (const pre of root.querySelectorAll("pre")) {
    const button = document.createElement("button");
    button.className = "btn copy";
    button.dataset.skip = "";
    button.textContent = t("copy");
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const text = [...pre.childNodes].filter((n) => n !== button).map((n) => n.textContent).join("");
      navigator.clipboard.writeText(text).then(() => toast(t("copied")));
    });
    pre.append(button);
  }
  for (const el of root.querySelectorAll(".math")) {
    const tex = el.textContent;
    el.dataset.tex = tex;
    if (!window.katex) continue;
    try {
      window.katex.render(tex, el, { displayMode: el.classList.contains("math-display"), throwOnError: false, output: "htmlAndMathml" });
    } catch {
      el.textContent = tex;
    }
  }
  for (const table of root.querySelectorAll("table")) {
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    wrap.dataset.wrap = "";
    table.replaceWith(wrap);
    wrap.append(table);
  }
  for (const img of root.querySelectorAll("img")) {
    img.loading = "lazy";
    img.classList.add("zoomable");
    img.addEventListener("click", () => zoom(img.src));
  }
}

function zoom(/** @type {string} */ src) {
  const layer = document.createElement("div");
  layer.className = "zoom";
  layer.innerHTML = `<img alt="">`;
  /** @type {HTMLImageElement} */ (layer.firstElementChild).src = src;
  const close = () => {
    layer.remove();
    removeEventListener("keydown", onKey, true);
  };
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  layer.addEventListener("click", close);
  addEventListener("keydown", onKey, true);
  document.body.append(layer);
}
