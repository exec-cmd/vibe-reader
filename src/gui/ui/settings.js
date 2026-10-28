// Typography and appearance panel; changes apply at once and are saved to config.toml.

import { $, applyConfig, commands, saveConfig, state } from "./core.js";
import { loadLocale, t, translate } from "./i18n.js";
import { relayoutKeepingPlace } from "./reader.js";

/** Fonts shipped in ui/fonts; keep in sync with vibe_reader_core::config::FONTS. */
export const FONTS = ["Literata", "Spectral", "Cormorant Garamond", "Playfair Display", "Onest", "JetBrains Mono"];

function changed() {
  applyConfig();
  saveConfig();
  requestAnimationFrame(relayoutKeepingPlace);
}

export function render() {
  const { reader, typography: ty } = state.config;
  const panel = $("#settings");
  const label = (f) => (f === "system" ? t("systemFont") : f === "auto" ? t("fontAuto") : f);
  const fonts = ["auto", ...FONTS, "system"].map((f) => `<option value="${f}" ${f === ty.font ? "selected" : ""}>${label(f)}</option>`);
  const seg = (name, value, options) =>
    options.map(([v, label]) => `<button class="btn quiet" data-${name}="${v}" aria-pressed="${v === value}">${t(label)}</button>`).join("");
  panel.innerHTML = `
    <h3>${t("settings")}</h3>
    <label class="field"><span>${t("font")}</span><select id="set-font">${fonts.join("")}</select></label>
    <label class="field"><span>${t("size")} · <b id="v-size">${ty.size}</b></span><input id="set-size" type="range" min="14" max="30" step="1" value="${ty.size}"></label>
    <label class="field"><span>${t("width")} · <b id="v-width">${ty.width}</b></span><input id="set-width" type="range" min="22" max="50" step="1" value="${ty.width}"></label>
    <label class="field"><span>${t("leading")} · <b id="v-leading">${ty.line_height}</b></span><input id="set-leading" type="range" min="1.2" max="2.2" step="0.05" value="${ty.line_height}"></label>
    <label class="check"><input id="set-justify" type="checkbox" ${ty.justify ? "checked" : ""}> ${t("justify")}</label>
    <label class="check"><input id="set-hyphens" type="checkbox" ${ty.hyphens ? "checked" : ""}> ${t("hyphens")}</label>
    <div class="field"><span>${t("mode")}</span><div class="row">${seg("mode", reader.mode, [["auto", "modeAuto"], ["light", "modeLight"], ["dark", "modeDark"]])}</div></div>
    <div class="field"><span>${t("language")}</span><div class="row">${seg("locale", reader.locale, [["auto", "modeAuto"], ["en", "English"], ["ru", "Русский"]])}</div></div>
    <label class="check"><input id="set-vim" type="checkbox" ${reader.vim ? "checked" : ""}> ${t("vim")}</label>
    <label class="check"><input id="set-motion" type="checkbox" ${reader.reduce_motion ? "checked" : ""}> ${t("reduceMotion")}</label>`;

  const input = (id) => /** @type {HTMLInputElement} */ ($(id));
  input("#set-font").addEventListener("change", (e) => ((ty.font = e.target.value), changed()));
  for (const [id, key, out] of [["#set-size", "size", "#v-size"], ["#set-width", "width", "#v-width"], ["#set-leading", "line_height", "#v-leading"]]) {
    input(id).addEventListener("input", (e) => {
      ty[key] = Number(e.target.value);
      $(out).textContent = e.target.value;
      changed();
    });
  }
  input("#set-justify").addEventListener("change", (e) => ((ty.justify = e.target.checked), changed()));
  input("#set-hyphens").addEventListener("change", (e) => ((ty.hyphens = e.target.checked), changed()));
  input("#set-vim").addEventListener("change", (e) => ((reader.vim = e.target.checked), saveConfig()));
  input("#set-motion").addEventListener("change", (e) => ((reader.reduce_motion = e.target.checked), changed()));
  for (const btn of panel.querySelectorAll("[data-mode]")) {
    btn.addEventListener("click", () => ((reader.mode = btn.dataset.mode), changed(), render()));
  }
  for (const btn of panel.querySelectorAll("[data-locale]")) {
    btn.addEventListener("click", async () => {
      reader.locale = btn.dataset.locale;
      saveConfig();
      await loadLocale(reader.locale);
      translate();
      render();
    });
  }
}

export function toggleMode() {
  const dark = document.documentElement.dataset.mode === "dark";
  state.config.reader.mode = dark ? "light" : "dark";
  changed();
  render();
}

export function init() {
  render();
  commands.set("mode", { label: () => t("cmdMode"), run: toggleMode, key: "D" });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyConfig);
}
