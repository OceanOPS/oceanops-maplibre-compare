import type maplibregl from "maplibre-gl";
import { appendToolbarHint, clearToolbarHint } from "./oceanops/mapToolbar";
import { isMapFullscreen, setMapFullscreen } from "./oceanops/mapFullscreen";
import type { BasemapKind } from "./basemap";
import {
  MAP_PROJECTION_CYCLE,
  mapProjectionLabel,
  nextMapProjection,
  type MapProjectionMode,
} from "./layers";
import { assetUrl } from "./assetUrl";
import {
  BASEMAP_KIND_CYCLE,
  mountProjectionStepDots,
  setBasemapPreviewContent,
  setCycleOptionLabel,
  updateProjectionStepDots,
} from "./mapDisplayCycleUi";

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
  const basemapSteps = mountProjectionStepDots(0, BASEMAP_KIND_CYCLE.length);
  const basemapHint = document.createElement("span");
  basemapHint.className = "o-basemap-kind-label";
  basemapSection.append(previewBtn, basemapSteps, basemapHint);

  const divider = document.createElement("div");
  divider.className = "o-map-display-divider";
  divider.setAttribute("aria-hidden", "true");

  const projectionSection = document.createElement("div");
  projectionSection.className = "o-map-display-section o-map-display-section--projection";
  const projectionPreviewBtn = document.createElement("button");
  projectionPreviewBtn.type = "button";
  projectionPreviewBtn.className = "o-basemap-preview-btn";
  const projectionSteps = mountProjectionStepDots(0, MAP_PROJECTION_CYCLE.length);
  const projectionHint = document.createElement("span");
  projectionHint.className = "o-basemap-kind-label";
  projectionSection.append(projectionPreviewBtn, projectionSteps, projectionHint);

  const divider2 = document.createElement("div");
  divider2.className = "o-map-display-divider";
  divider2.setAttribute("aria-hidden", "true");

  const scrollWheelSection = document.createElement("div");
  scrollWheelSection.className =
    "o-map-display-section o-map-display-section--scroll-wheel";
  const scrollWheelSwitch = document.createElement("button");
  scrollWheelSwitch.type = "button";
  scrollWheelSwitch.className = "o-map-scroll-wheel-switch";
  scrollWheelSwitch.setAttribute("role", "switch");
  scrollWheelSwitch.setAttribute("aria-checked", "false");
  scrollWheelSwitch.setAttribute("aria-label", "Enable mouse wheel zoom");
  scrollWheelSwitch.innerHTML = `<span class="o-map-scroll-wheel-switch__track" aria-hidden="true"><span class="o-map-scroll-wheel-switch__thumb"></span></span>`;

  const scrollWheelHint = document.createElement("span");
  scrollWheelHint.className = "o-basemap-kind-label";
  scrollWheelHint.textContent = "Scroll zoom";

  const syncScrollWheelUi = () => {
    scrollWheelSwitch.classList.toggle("is-on", scrollWheelZoomEnabled);
    scrollWheelSwitch.setAttribute(
      "aria-checked",
      scrollWheelZoomEnabled ? "true" : "false"
    );
    const label = scrollWheelZoomEnabled
      ? "Disable mouse wheel zoom"
      : "Enable mouse wheel zoom";
    scrollWheelSwitch.setAttribute("aria-label", label);
    appendToolbarHint(scrollWheelSwitch, label);
  };

  scrollWheelSwitch.addEventListener("click", () => {
    applyScrollWheelZoom(options.map, !scrollWheelZoomEnabled);
    syncScrollWheelUi();
    scrollWheelSwitch.blur();
  });

  applyScrollWheelZoom(options.map, false);
  syncScrollWheelUi();

  options.map.on("load", () => {
    applyScrollWheelZoom(options.map, scrollWheelZoomEnabled);
    syncScrollWheelUi();
  });
  scrollWheelSection.append(scrollWheelSwitch, scrollWheelHint);

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
    const basemapIndex = BASEMAP_KIND_CYCLE.indexOf(kind);
    updateProjectionStepDots(
      basemapSteps,
      basemapIndex >= 0 ? basemapIndex : 0
    );
    if (kind === "map") {
      setBasemapPreviewContent(
        previewBtn,
        `<div class="o-basemap-preview" style="background-image:url('${assetUrl("/img/map.jpeg")}')"></div>`
      );
      setCycleOptionLabel(basemapHint, "Map layer");
      previewBtn.setAttribute("aria-label", "Switch to satellite layer");
    } else {
      setBasemapPreviewContent(
        previewBtn,
        `<div class="o-basemap-preview" style="background-image:url('${assetUrl("/img/satelite.jpeg")}')"></div>`
      );
      setCycleOptionLabel(basemapHint, "Satellite layer");
      previewBtn.setAttribute("aria-label", "Switch to map layer");
    }
    clearToolbarHint(previewBtn);
  };

  const syncProjectionUi = () => {
    const current = options.getProjection();
    const currentIndex = MAP_PROJECTION_CYCLE.indexOf(current);
    updateProjectionStepDots(
      projectionSteps,
      currentIndex >= 0 ? currentIndex : 0
    );
    const next = nextMapProjection(current);
    const preview = projectionPreviewImage(current);
    setBasemapPreviewContent(
      projectionPreviewBtn,
      `<div class="o-basemap-preview" style="background-image:url('${assetUrl(`/img/${preview}`)}')"></div>`
    );
    setCycleOptionLabel(projectionHint, mapProjectionLabel(current));
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
