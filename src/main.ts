import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./oceanops-ui.css";
import {
  emptyStyle,
  ensureBasemapSources,
  setBasemapKind,
  type BasemapKind,
} from "./basemap";
import { categories, legendLayerIdsForCategory, type Category } from "./categories";
import {
  loadAllCategories,
  reloadLineLayers,
  setCategoryVisible,
  type MapProjectionMode,
} from "./layers";
import { mountFloatingToolbar, mountGlobeRotationControl } from "./floatingToolbar";
import { mountLegend } from "./legend";
import { bindMapInteractions } from "./mapInteractions";
import { mountMapDisplayMenu } from "./mapDisplayMenu";
import { createCountryFilterController } from "./countryFilterController";
import {
  addMooringStackLayer,
  loadMooringStackData,
} from "./mooringStackLayer";
import "./mapPopupStyles.css";
import "./maplibre-overrides.css";

const visibility = new Map<string, boolean>(
  categories.map((c) => [c.id, true])
);

function isCategoryVisible(cat: Category): boolean {
  return legendLayerIdsForCategory(cat).every((id) => visibility.get(id) !== false);
}

function setCategoryVisibility(cat: Category, visible: boolean): void {
  for (const id of legendLayerIdsForCategory(cat)) visibility.set(id, visible);
}

let projectionMode: MapProjectionMode = "globe";
let basemapKind: BasemapKind = "map";
let globeRotating = false;
let rotationFrame = 0;

const map = new maplibregl.Map({
  container: "map",
  style: emptyStyle(),
  center: [-150, 10],
  zoom: 2.7,
  pitch: 0,
  bearing: 0,
  attributionControl: false,
});

map.addControl(
  new maplibregl.NavigationControl({
    showZoom: true,
    showCompass: true,
    visualizePitch: false,
  }),
  "top-left"
);

const shell = document.getElementById("mapShell")!;

const onShellLayoutChange = () => map.resize();

let countryFilter: ReturnType<typeof createCountryFilterController> | null = null;

const legendUi = mountLegend({
  isVisible: isCategoryVisible,
  onVisibilityChange: (cat, visible) => {
    setCategoryVisibility(cat, visible);
    setCategoryVisible(map, cat, visible);
  },
  onLayoutChange: onShellLayoutChange,
  getCountryFilter: () => countryFilter,
});

const toolbarHost = mountFloatingToolbar(map);
legendUi.toggleButton.classList.add("esri-component");
toolbarHost.insertBefore(legendUi.toggleButton, toolbarHost.firstChild);

const rotationCallbacks: Array<() => void> = [];
mountGlobeRotationControl(toolbarHost, {
  isGlobe: () => projectionMode === "globe",
  isRotating: () => globeRotating,
  toggleRotation: () => {
    globeRotating = !globeRotating;
    if (globeRotating) startGlobeRotation();
    else stopGlobeRotation();
    rotationCallbacks.forEach((cb) => cb());
  },
  onRotationStateChange: (cb) => {
    rotationCallbacks.push(cb);
  },
});

const displayMenu = mountMapDisplayMenu({
  map,
  getBasemapKind: () => basemapKind,
  onBasemapKindChange: (kind) => {
    basemapKind = kind;
    setBasemapKind(map, kind);
  },
  getProjection: () => projectionMode,
  onProjectionChange: async (mode) => {
    applyProjection(mode);
  },
  onShellLayoutChange,
});
displayMenu.classList.add("esri-component");
toolbarHost.appendChild(displayMenu);

function startGlobeRotation(): void {
  const step = () => {
    if (!globeRotating || projectionMode !== "globe") return;
    map.setBearing(map.getBearing() + 0.15);
    rotationFrame = requestAnimationFrame(step);
  };
  rotationFrame = requestAnimationFrame(step);
}

function stopGlobeRotation(): void {
  globeRotating = false;
  cancelAnimationFrame(rotationFrame);
}

function applyProjection(mode: MapProjectionMode) {
  projectionMode = mode;
  if (mode !== "globe") stopGlobeRotation();
  if (mode === "globe") {
    map.setProjection({ type: "globe" });
  } else {
    map.setProjection({ type: "mercator" });
  }
  void reloadLineLayers(map, mode);
  rotationCallbacks.forEach((cb) => cb());
  (displayMenu as HTMLDivElement & { refresh?: () => void }).refresh?.();
}

map.on("load", async () => {
  ensureBasemapSources(map);
  setBasemapKind(map, basemapKind);
  applyProjection("globe");

  if ("setFog" in map && typeof map.setFog === "function") {
    map.setFog({
      color: "#0b1e42",
      "high-color": "#0b1e42",
      "horizon-blend": 0.08,
    });
  }

  const mooringData = await loadMooringStackData("/");
  await loadAllCategories(map, projectionMode, mooringData);
  await addMooringStackLayer(map, mooringData.stackLayer);

  for (const cat of categories) {
    if (!isCategoryVisible(cat)) setCategoryVisible(map, cat, false);
  }

  countryFilter = createCountryFilterController(map);
  countryFilter.apply();
  legendUi.refreshCounts();

  bindMapInteractions(map);
});

window.addEventListener("resize", () => map.resize());
