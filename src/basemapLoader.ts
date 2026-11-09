/**
 * Full-screen overlay while Equal Earth MapServer basemap image loads/decodes.
 * Percent is shown when the response exposes Content-Length; otherwise "…".
 */
export function ensureBasemapLoader(): HTMLDivElement {
  let el = document.getElementById("o-basemap-loader") as HTMLDivElement | null;
  if (el) return el;
  el = document.createElement("div");
  el.id = "o-basemap-loader";
  el.className = "o-basemap-loader";
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("role", "status");
  el.innerHTML = `
    <div class="o-basemap-loader__inner">
      <div class="o-basemap-loader__spinner" aria-hidden="true"></div>
      <div class="o-basemap-loader__percent" aria-live="polite"></div>
    </div>`;
  document.getElementById("mapShell")?.appendChild(el);
  return el;
}

/** `null` = size unknown (indeterminate); 0–100 = download / processing progress. */
export function setBasemapLoaderProgress(percent: number | null): void {
  const el = ensureBasemapLoader();
  const label = el.querySelector(".o-basemap-loader__percent");
  if (!label) return;
  if (percent == null) {
    label.textContent = "…";
    el.setAttribute("aria-valuetext", "Loading basemap");
  } else {
    label.textContent = `${percent}%`;
    el.setAttribute("aria-valuetext", `Loading basemap, ${percent} percent`);
  }
}

export function setBasemapLoaderVisible(visible: boolean): void {
  const el = ensureBasemapLoader();
  el.classList.toggle("is-visible", visible);
  el.setAttribute("aria-busy", visible ? "true" : "false");
  if (!visible) {
    const label = el.querySelector(".o-basemap-loader__percent");
    if (label) label.textContent = "";
    el.removeAttribute("aria-valuetext");
  } else {
    setBasemapLoaderProgress(null);
  }
}
