// Translator: a card in the reader that translates a selection, the visible page or any text
// with the provider chosen in Settings → Translator.

import { $, call, escapeHtml, saveConfig, state } from "./core.js";
import { locale, t } from "./i18n.js";
import { icon, toast } from "./ui.js";

/** Target languages offered in the list; any other code can be set in config.toml. */
export const LANGUAGES = ["en", "ru", "uk", "be", "kk", "de", "fr", "es", "it", "pt", "pl", "cs", "nl", "sv", "fi", "tr", "el", "he", "ar", "hi", "zh", "ja", "ko"];

/** Language names in the interface language. */
export function languageName(/** @type {string} */ code) {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export const target = () => {
  const wanted = state.config.translate.target;
  return wanted === "auto" ? locale : wanted;
};

/** Text of the visible page, set by reader.js. @type {() => string} */
let pageText = () => "";

export const isOpen = () => !$("#translator").hidden;
export const close = () => ($("#translator").hidden = true);

/**
 * Opens the card. With `text`, translates it at once; with `page`, translates the visible page.
 * @param {{text?: string, page?: boolean}} [what]
 */
export function open(what = {}) {
  const box = $("#translator");
  if (box.hidden || !box.childElementCount) render(box);
  box.hidden = false;
  const source = /** @type {HTMLTextAreaElement} */ (box.querySelector("textarea"));
  const text = what.page ? pageText() : what.text;
  if (text) {
    source.value = text.trim();
    run();
  } else source.focus();
}

export function toggle() {
  isOpen() ? close() : open();
}

function render(/** @type {HTMLElement} */ box) {
  const provider = { google: "Google", deepl: "DeepL", openrouter: "OpenRouter" }[state.config.translate.provider] ?? "";
  box.innerHTML = `
    <header>${icon("translate", 18)}<h2 id="translator-title">${escapeHtml(t("translator"))}</h2><small>${escapeHtml(provider)}</small>
      <button class="icon-btn" data-act="close" title="${escapeHtml(t("close"))}">${icon("close", 16)}</button></header>
    <textarea class="textarea" spellcheck="false"></textarea>
    <div class="row">
      <select class="input"></select>
      <button class="btn" data-act="page">${icon("page", 15)}${escapeHtml(t("thisPage"))}</button>
      <button class="btn primary" data-act="run">${escapeHtml(t("translate"))}</button>
    </div>
    <div class="translation" aria-live="polite"></div>
    <div class="row"><span class="grow"></span>
      <button class="btn quiet" data-act="copy">${icon("copy", 15)}${escapeHtml(t("copy"))}</button></div>`;
  /** @type {HTMLElement} */ (box.querySelector(".translation")).dataset.empty = t("translationHint");
  /** @type {HTMLTextAreaElement} */ (box.querySelector("textarea")).placeholder = t("translatorPlaceholder");
  const select = /** @type {HTMLSelectElement} */ (box.querySelector("select"));
  const codes = [...new Set([target(), ...LANGUAGES])];
  select.innerHTML = codes.map((c) => `<option value="${c}">${escapeHtml(languageName(c))}</option>`).join("");
  select.value = target();
  select.addEventListener("change", () => {
    state.config.translate.target = select.value;
    saveConfig();
    run();
  });
  box.querySelector('[data-act="close"]').addEventListener("click", close);
  box.querySelector('[data-act="page"]').addEventListener("click", () => open({ page: true }));
  box.querySelector('[data-act="run"]').addEventListener("click", run);
  box.querySelector('[data-act="copy"]').addEventListener("click", () => {
    const text = box.querySelector(".translation").textContent;
    if (text) navigator.clipboard.writeText(text).then(() => toast(t("copied")));
  });
  box.querySelector("textarea").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run();
    if (e.key === "Escape") close();
    e.stopPropagation();
  });
}

let request = 0;
async function run() {
  const box = $("#translator");
  const text = /** @type {HTMLTextAreaElement} */ (box.querySelector("textarea")).value.trim();
  const out = /** @type {HTMLElement} */ (box.querySelector(".translation"));
  if (!text) return;
  const tr = state.config.translate;
  if (!tr[`${tr.provider}_key`]?.trim()) {
    out.innerHTML = `${escapeHtml(t("translatorNoKey"))} <button class="btn quiet">${escapeHtml(t("openSettings"))}</button>`;
    out.querySelector("button").addEventListener("click", () => /** @type {any} */ (window).vibe.openSettings("translator"));
    return;
  }
  const mine = ++request;
  out.classList.add("busy");
  try {
    const result = await call("translate", { text, target: target() });
    if (mine === request) out.textContent = result;
  } catch (e) {
    if (mine === request) out.textContent = String(e);
  } finally {
    if (mine === request) out.classList.remove("busy");
  }
}

export function init(/** @type {() => string} */ visibleText) {
  pageText = visibleText;
}
