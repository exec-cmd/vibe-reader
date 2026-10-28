// Covers for PDFs: the first page, drawn once with pdf.js and stored by the window.

import { call } from "./core.js";

let pdfjs = null;
/** One cover at a time; large PDFs are heavy to open. */
let queue = Promise.resolve();

export async function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = await import("./vendor/pdfjs/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.mjs";
  }
  return pdfjs;
}

/** Draws page 1 of library book `id` and saves it as the cover. Resolves to true on success. */
export function pdfCover(/** @type {number} */ id) {
  const job = queue.then(async () => {
    try {
      const lib = await loadPdfjs();
      const doc = await lib.getDocument({ url: `/file/${id}`, isEvalSupported: false, enableXfa: false }).promise;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 360 / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      await doc.destroy();
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
      const bytes = [...new Uint8Array(await blob.arrayBuffer())];
      await call("set_cover", { id, path: null, bytes });
      return true;
    } catch (e) {
      console.warn("pdf cover", e);
      return false;
    }
  });
  queue = job.then(() => {});
  return job;
}
