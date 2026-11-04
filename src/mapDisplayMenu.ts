import type maplibregl from "maplibre-gl";
import { appendToolbarHint, clearToolbarHint } from "./oceanops/mapToolbar";
import { isMapFullscreen, setMapFullscreen } from "./oceanops/mapFullscreen";
import type { BasemapKind } from "./basemap";
import {
  mapProjectionLabel,
  nextMapProjection,
  type MapProjectionMode,
} from "./layers";
import { assetUrl } from "./assetUrl";

export type DisplayMenuOptions = {
  map: maplibregl.Map;
  getBasemapKind: () => BasemapKind;
  onBasemapKindChange: (kind: BasemapKind) => void;
  getProjection: () => MapProjectionMode;
  onProjectionChange: (mode: MapProjectionMode) => void | Promise<void>;
  onShellLayoutChange?: () => void;
};

/** User preference — source of truth for UI (#180); MapLibre `isEnabled()` can disagree on mobile. */
let scrollWheelZoomEnabled = false;

export function isScrollWheelZoomEnabled(): boolean {
  return scrollWheelZoomEnabled;
}

export function applyScrollWheelZoom(map: maplibregl.Map, enabled: boolean): void {
  scrollWheelZoomEnabled = enabled;
  if (enabled) map.scrollZoom.enable();
  else map.scrollZoom.disable();
}

export function mountMapDisplayMenu(options: DisplayMenuOptions): HTMLDivElement {
  const menu = document.createElement("div");
  menu.className = "o-map-display-menu";

  const basemapSection = document.createElement("div");
  basemapSection.className = "o-map-display-section o-map-display-section--basemap";
  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "o-basemap-preview-btn";
  const basemapHint = document.createElement("span");
  basemapHint.className = "o-basemap-kind-label";
  basemapSection.append(previewBtn, basemapHint);

  const divider = document.createElement("div");
  divider.className = "o-map-display-divider";
  divider.setAttribute("aria-hidden", "true");

  const projectionSection = document.createElement("div");
  projectionSection.className = "o-map-display-section o-map-display-section--projection";
  const projectionPreviewBtn = document.createElement("button");
  projectionPreviewBtn.type = "button";
  projectionPreviewBtn.className = "o-basemap-preview-btn";
  const projectionHint = document.createElement("span");
  projectionHint.className = "o-basemap-kind-label";
  projectionSection.append(projectionPreviewBtn, projectionHint);

  const divider2 = document.createElement("div");
  divider2.className = "o-map-display-divider";
  divider2.setAttribute("aria-hidden", "true");

  const scrollWheelSection = document.createElement("div");
  scrollWheelSection.className =
    "o-map-display-section o-map-display-section--scroll-wheel";
  const scrollWheelBtn = document.createElement("button");
  scrollWheelBtn.type = "button";
  scrollWheelBtn.className = "o-map-scroll-wheel-toggle";
  const scrollWheelIcon = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="3" width="10" height="18" rx="5" stroke="currentColor" stroke-width="1.75"/>
      <path d="M12 7v3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
      <path d="M9.5 10.5 12 8l2.5 2.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  const scrollWheelHint = document.createElement("span");
  scrollWheelHint.className = "o-basemap-kind-label";
  scrollWheelHint.textContent = "Scroll zoom";

  const syncScrollWheelUi = () => {
    scrollWheelBtn.classList.toggle("is-active", scrollWheelZoomEnabled);
    scrollWheelBtn.innerHTML = scrollWheelIcon;
    scrollWheelBtn.setAttribute("aria-pressed", scrollWheelZoomEnabled ? "true" : "false");
    const label = scrollWheelZoomEnabled
      ? "Disable mouse wheel zoom"
      : "Enable mouse wheel zoom";
    scrollWheelBtn.setAttribute("aria-label", label);
    appendToolbarHint(scrollWheelBtn, label);
  };

  scrollWheelBtn.addEventListener("click", () => {
    applyScrollWheelZoom(options.map, !scrollWheelZoomEnabled);
    syncScrollWheelUi();
    scrollWheelBtn.blur();
  });

  applyScrollWheelZoom(options.map, false);
  syncScrollWheelUi();

  options.map.on("load", () => {
    applyScrollWheelZoom(options.map, scrollWheelZoomEnabled);
    syncScrollWheelUi();
  });
  scrollWheelSection.append(scrollWheelBtn, scrollWheelHint);

  const divider3 = document.createElement("div");
  divider3.className = "o-map-display-divider";
  divider3.setAttribute("aria-hidden", "true");

  const fullscreenSection = document.createElement("div");
  fullscreenSection.className = "o-map-display-section o-map-display-section--fullscreen";
  const fullscreenBtn = document.createElement("button");
  fullscreenBtn.type = "button";
  fullscreenBtn.className = "o-map-fullscreen-toggle";
  const expandIcon = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  const compressIcon = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  const syncFullscreenUi = () => {
    const active = isMapFullscreen();
    const label = active ? "Collapse map" : "Expand map";
    fullscreenBtn.classList.toggle("is-active", active);
    fullscreenBtn.innerHTML = active ? compressIcon : expandIcon;
    fullscreenBtn.setAttribute("aria-label", label);
    appendToolbarHint(fullscreenBtn, label);
  };
  fullscreenBtn.addEventListener("click", () => {
    void setMapFullscreen(!isMapFullscreen(), options.onShellLayoutChange);
    fullscreenBtn.blur();
  });
  document.addEventListener("fullscreenchange", syncFullscreenUi);
  document.addEventListener("map-fullscreen-change", syncFullscreenUi);
  syncFullscreenUi();
  fullscreenSection.append(fullscreenBtn);

  const projectionPreviewImage = (target: MapProjectionMode): string => {
    if (target === "globe") return "globe.jpeg";
    return "mercator.jpeg";
  };

  const updateBasemapUi = () => {
    const kind = options.getBasemapKind();
    if (kind === "map") {
      previewBtn.innerHTML = `<div class="o-basemap-preview" style="background-image:url('${assetUrl("/img/satelite.jpeg")}')"></div>`;
      basemapHint.textContent = "Satellite layer";
      previewBtn.setAttribute("aria-label", "Switch to satellite layer");
    } else {
      previewBtn.innerHTML = `<div class="o-basemap-preview" style="background-image:url('${assetUrl("/img/map.jpeg")}')"></div>`;
      basemapHint.textContent = "Map layer";
      previewBtn.setAttribute("aria-label", "Switch to map layer");
    }
    clearToolbarHint(previewBtn);
  };

  const syncProjectionUi = () => {
    const next = nextMapProjection(options.getProjection());
    const preview = projectionPreviewImage(next);
    projectionPreviewBtn.innerHTML = `<div class="o-basemap-preview" style="background-image:url('${assetUrl(`/img/${preview}`)}')"></div>`;
    projectionHint.textContent = mapProjectionLabel(next);
    projectionPreviewBtn.setAttribute(
      "aria-label",
      `Switch to ${mapProjectionLabel(next)}`
    );
    clearToolbarHint(projectionPreviewBtn);
  };

  const updateUi = () => {
    updateBasemapUi();
    syncProjectionUi();
  };
  updateUi();

  previewBtn.addEventListener("click", () => {
    const next = options.getBasemapKind() === "map" ? "satellite" : "map";
    options.onBasemapKindChange(next);
    updateBasemapUi();
  });

  projectionPreviewBtn.addEventListener("click", () => {
    void (async () => {
      const next = nextMapProjection(options.getProjection());
      projectionSection.classList.add("is-busy");
      projectionPreviewBtn.disabled = true;
      try {
        await options.onProjectionChange(next);
        updateUi();
      } finally {
        projectionSection.classList.remove("is-busy");
        projectionPreviewBtn.disabled = false;
      }
    })();
  });

  menu.append(
    basemapSection,
    divider,
    projectionSection,
    divider2,
    scrollWheelSection,
    divider3,
    fullscreenSection
  );

  (menu as HTMLDivElement & { refresh?: () => void }).refresh = updateUi;
  return menu;
}
