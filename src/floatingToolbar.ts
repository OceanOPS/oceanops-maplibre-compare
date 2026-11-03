import type maplibregl from "maplibre-gl";
import {
  appendToolbarHint,
  MAP_ROTATION_HINT,
  RESET_MAP_ORIENTATION_HINT,
  ZOOM_IN_HINT,
  ZOOM_OUT_HINT,
} from "./oceanops/mapToolbar";

/** Top-left control stack matching oceanops-simple-map (Esri UI layout). */
export function mountFloatingToolbar(map: maplibregl.Map): HTMLDivElement {
  const host = document.createElement("div");
  host.className = "esri-ui-top-left o-maplibre-ui-top-left";
  map.getContainer().appendChild(host);

  const navSlot = map.getContainer().querySelector(".maplibregl-ctrl-top-left");
  if (navSlot) {
    navSlot.classList.remove("maplibregl-ctrl-top-left");
    const zoomWrap = document.createElement("div");
    zoomWrap.className = "esri-component esri-zoom o-maplibre-nav";
    while (navSlot.firstChild) {
      zoomWrap.appendChild(navSlot.firstChild);
    }
    navSlot.remove();
    host.appendChild(zoomWrap);
    wireMapLibreNavHints(zoomWrap);
  }

  return host;
}

function wireMapLibreNavHints(root: Element): void {
  const zoomIn = root.querySelector<HTMLButtonElement>("button.maplibregl-ctrl-zoom-in");
  const zoomOut = root.querySelector<HTMLButtonElement>("button.maplibregl-ctrl-zoom-out");
  if (zoomIn) wrapZoomButton(zoomIn, ZOOM_IN_HINT);
  if (zoomOut) wrapZoomButton(zoomOut, ZOOM_OUT_HINT);

  const compass = root.querySelector<HTMLButtonElement>(".maplibregl-ctrl-compass");
  if (compass) {
    const compassWrap = document.createElement("div");
    compassWrap.className = "esri-component esri-compass o-maplibre-compass";
    compass.parentElement?.insertBefore(compassWrap, compass);
    compassWrap.appendChild(compass);
    compass.classList.add("esri-widget--button");
    compass.setAttribute("aria-label", RESET_MAP_ORIENTATION_HINT);
    appendToolbarHint(compassWrap, RESET_MAP_ORIENTATION_HINT);
  }

  root.querySelector(".maplibregl-ctrl-pitch")?.remove();
}

function wrapZoomButton(button: HTMLButtonElement, hint: string): void {
  const wrap = document.createElement("div");
  wrap.className = "o-map-toolbar-hint-wrap o-map-control-with-hint esri-widget--button";
  button.parentElement?.insertBefore(wrap, button);
  wrap.appendChild(button);
  button.setAttribute("aria-label", hint);
  appendToolbarHint(wrap, hint);
}

export function mountGlobeRotationControl(
  host: HTMLElement,
  options: {
    isGlobe: () => boolean;
    isRotating: () => boolean;
    toggleRotation: () => void;
    onRotationStateChange: (cb: () => void) => void;
  }
): HTMLDivElement {
  const rotationSection = document.createElement("div");
  rotationSection.className =
    "o-map-toolbar-section o-map-toolbar-section--rotation esri-component";

  const playPauseButton = document.createElement("button");
  playPauseButton.type = "button";
  playPauseButton.className = "o-rotation-toggle o-map-control-with-hint";
  const rotationIcon = document.createElement("span");
  rotationIcon.className = "o-rotation-toggle__icon";
  playPauseButton.append(rotationIcon);

  const rotationPlayIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 3L13 8L5 13V3Z" fill="#f8f8f8"/></svg>`;
  const rotationPauseIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="4" y="3" width="3" height="10" fill="#f8f8f8" rx="1"/><rect x="9" y="3" width="3" height="10" fill="#f8f8f8" rx="1"/></svg>`;

  const update = () => {
    rotationSection.style.display = options.isGlobe() ? "" : "none";
    rotationIcon.innerHTML = options.isRotating() ? rotationPauseIcon : rotationPlayIcon;
    const label = options.isRotating() ? "Pause map rotation" : MAP_ROTATION_HINT;
    playPauseButton.setAttribute("aria-label", label);
    appendToolbarHint(playPauseButton, label);
  };

  update();
  options.onRotationStateChange(update);
  playPauseButton.addEventListener("click", () => {
    options.toggleRotation();
    update();
  });

  rotationSection.append(playPauseButton);
  host.appendChild(rotationSection);
  return rotationSection;
}
