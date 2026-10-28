// PDF pages drawn by pdf.js, rendered lazily as they scroll into view.
// The atmosphere frames the pages; the pages themselves keep their own look.

/** @typedef {{ pages: number, goto: (index: number) => void, current: () => number }} PdfView */

let pdfjs = null;

/**
 * @param {HTMLElement} container
 * @param {(index: number) => void} onPage called with the zero-based page in view
 * @returns {Promise<PdfView>}
 */
export async function render(container, onPage) {
  pdfjs ??= await import("./vendor/pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ url: "/book", isEvalSupported: false }).promise;
  const first = await doc.getPage(1);
  const base = first.getViewport({ scale: 1 });
  const width = Math.min(container.parentElement.clientWidth - 48, 980);
  const scale = width / base.width;
  container.replaceChildren();
  const holders = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const holder = document.createElement("div");
    holder.className = "pdf-page";
    holder.dataset.page = String(i - 1);
    holder.style.width = `${width}px`;
    holder.style.height = `${base.height * scale}px`;
    container.append(holder);
    holders.push(holder);
  }
  let current = 0;
  const draw = async (/** @type {HTMLElement} */ holder) => {
    if (holder.dataset.drawn) return;
    holder.dataset.drawn = "1";
    const page = await doc.getPage(Number(holder.dataset.page) + 1);
    const viewport = page.getViewport({ scale: scale * Math.min(devicePixelRatio || 1, 2) });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    holder.style.height = `${viewport.height / Math.min(devicePixelRatio || 1, 2)}px`;
    holder.append(canvas);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  };
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) draw(/** @type {HTMLElement} */ (e.target));
    },
    { rootMargin: "800px 0px" },
  );
  const where = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          current = Number(/** @type {HTMLElement} */ (e.target).dataset.page);
          onPage(current);
        }
      }
    },
    { threshold: 0.5 },
  );
  for (const h of holders) {
    seen.observe(h);
    where.observe(h);
  }
  return {
    pages: doc.numPages,
    goto: (index) => holders[Math.max(0, Math.min(holders.length - 1, index))]?.scrollIntoView({ block: "start" }),
    current: () => current,
  };
}
