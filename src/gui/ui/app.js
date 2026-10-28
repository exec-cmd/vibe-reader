// Prototype: fill columns with text, report readiness, reload styles from the config folder.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const sentence = "Он шёл медленно, как бы в нерешимости, и считал шаги до угла. ";
const probe = document.getElementById("probe");
for (let i = 0; i < 60; i++) {
  const p = document.createElement("p");
  p.textContent = sentence.repeat(6);
  probe.after(p);
}

const pages = document.getElementById("pages");
const report = () => {
  const count = Math.round(pages.scrollWidth / pages.clientWidth);
  document.getElementById("status").textContent = `${count} страниц · ${navigator.userAgent}`;
};
report();
addEventListener("resize", report);

listen("ui-changed", ({ payload }) => {
  if (payload.every((path) => path.endsWith(".css"))) {
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      link.href = link.href.split("?")[0] + "?" + Date.now();
    }
  } else {
    location.reload();
  }
});

requestAnimationFrame(() => invoke("ready"));
