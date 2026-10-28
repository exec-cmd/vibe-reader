// Interface strings. Dictionaries live in i18n/<locale>.json; English is the fallback.

/** @type {Record<string, string>} */
let strings = {};
/** @type {Record<string, string>} */
let fallback = {};
export let locale = "en";

/** @param {string} wanted "auto", "en" or "ru" */
export async function loadLocale(wanted) {
  locale = wanted === "auto" ? (navigator.language || "en").slice(0, 2) : wanted;
  fallback = await (await fetch("i18n/en.json")).json();
  try {
    strings = locale === "en" ? fallback : await (await fetch(`i18n/${locale}.json`)).json();
  } catch {
    locale = "en";
    strings = fallback;
  }
  document.documentElement.lang = locale;
}

/** @param {string} key @param {Record<string, string | number>} [vars] */
export function t(key, vars = {}) {
  const text = strings[key] ?? fallback[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
}

/** Fills [data-i18n], [data-i18n-title] and [data-i18n-placeholder] under `root`. */
export function translate(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-title]")) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = t(el.dataset.i18nPlaceholder);
}
