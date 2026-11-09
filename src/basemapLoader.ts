const SHOW_DELAY_MS = 200;
const HIDE_DELAY_MS = 120;

let overlay: HTMLDivElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let inFlightLoads = 0;
let bootstrapLoads = 0;

/** Top shimmer + bottom pill (same pattern as oceanops-simple-map). */
export function ensureBasemapLoader(): HTMLDivElement {
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "o-basemap-loader";
  overlay.className = "o-mapserver-loader";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="o-mapserver-loader__bar" aria-hidden="true"></div>
    <div class="o-mapserver-loader__panel">
      <div class="o-mapserver-loader__ring" aria-hidden="true"></div>
      <span class="o-mapserver-loader__label"></span>
    </div>`;
  document.getElementById("mapShell")?.appendChild(overlay);
  return overlay;
}

function labelElement(): HTMLSpanElement | null {
  return overlay?.querySelector(".o-mapserver-loader__label") ?? null;
}

let loaderBaseLabel = "";

function renderLoaderLabel(percent: number | null | undefined): void {
  const el = labelElement();
  if (!el) return;
  let text = loaderBaseLabel;
  if (percent === null) {
    text += " …";
  } else if (percent != null && Number.isFinite(percent)) {
    text += ` · ${Math.round(percent)}%`;
  }
  el.textContent = text;
}

export function setBasemapLoaderLabel(text: string): void {
  ensureBasemapLoader();
  loaderBaseLabel = text;
  renderLoaderLabel(undefined);
}

/** Byte download 0–100; `null` = size unknown or image processing after download. */
export function setBasemapLoaderProgress(percent: number | null): void {
  if (!loaderBaseLabel) return;
  renderLoaderLabel(percent);
}

function setLoaderActive(active: boolean): void {
  const el = ensureBasemapLoader();
  el.classList.toggle("is-active", active);
  el.setAttribute("aria-hidden", active ? "false" : "true");
  el.setAttribute("aria-busy", active ? "true" : "false");
}

function cancelShow(): void {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
}

function cancelHide(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function armShow(delay: number): void {
  cancelShow();
  showTimer = setTimeout(() => {
    showTimer = null;
    if (inFlightLoads > 0) setLoaderActive(true);
  }, delay);
}

function beginLoadChrome(options?: { immediate?: boolean }): void {
  ensureBasemapLoader();
  inFlightLoads += 1;
  cancelHide();
  if (overlay?.classList.contains("is-active")) return;
  const delay = options?.immediate ? 0 : SHOW_DELAY_MS;
  if (showTimer && delay > 0) return;
  armShow(delay);
}

function endLoadChrome(): void {
  inFlightLoads = Math.max(0, inFlightLoads - 1);
  cancelShow();
  if (inFlightLoads > 0) return;
  if (!overlay?.classList.contains("is-active")) return;
  cancelHide();
  hideTimer = setTimeout(() => {
    hideTimer = null;
    if (inFlightLoads === 0) setLoaderActive(false);
  }, HIDE_DELAY_MS);
}

/** App bootstrap (GeoJSON, globe setup) — same overlay as basemap loads. */
export function beginInitialMapLoad(): void {
  bootstrapLoads += 1;
  setBasemapLoaderLabel("Loading initial layer");
  beginLoadChrome({ immediate: true });
}

export function endInitialMapLoad(): void {
  bootstrapLoads = Math.max(0, bootstrapLoads - 1);
  endLoadChrome();
}

export function beginBasemapWorldLoad(): void {
  setBasemapLoaderLabel("Loading basemap");
  if (bootstrapLoads > 0) return;
  beginLoadChrome();
}

export function beginBasemapZoomLoad(mapZoom: number): void {
  const z = Number.isFinite(mapZoom) ? mapZoom.toFixed(1) : "…";
  setBasemapLoaderLabel(`Loading zoom ${z}`);
  if (bootstrapLoads > 0) return;
  beginLoadChrome();
}

export function endBasemapLayerLoad(): void {
  if (bootstrapLoads > 0) return;
  endLoadChrome();
}

/** @deprecated Prefer {@link beginBasemapZoomLoad} / {@link beginInitialMapLoad}. */
export function beginBasemapLoader(options?: { immediate?: boolean }): void {
  beginLoadChrome(options);
}

/** @deprecated Prefer {@link endBasemapLayerLoad} / {@link endInitialMapLoad}. */
export function endBasemapLoader(): void {
  endLoadChrome();
}

/** Reset overlay state (e.g. leaving Equal Earth). */
export function resetBasemapLoader(): void {
  bootstrapLoads = 0;
  inFlightLoads = 0;
  loaderBaseLabel = "";
  cancelShow();
  cancelHide();
  setLoaderActive(false);
}
