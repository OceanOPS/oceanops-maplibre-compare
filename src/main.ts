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
/** Match Esri SceneView: spin the globe by advancing camera longitude, not map bearing. */
const GLOBE_LONGITUDE_STEP = 0.1;
let globeRotating = true;
let rotationFrame = 0;

const map = new maplibregl.Map({
  container: "map",
  style: emptyStyle(),
  center: [-150, 10],
  zoom: 2.7,
  pitch: 0,
  bearing: 0,
  attributionControl: false,
  scrollZoom: false,
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
    if (projectionMode !== "globe") return;
    if (globeRotating) stopGlobeRotation();
    else {
      globeRotating = true;
      startGlobeRotation();
    }
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

function notifyRotationUi(): void {
  rotationCallbacks.forEach((cb) => cb());
}

function startGlobeRotation(): void {
  cancelAnimationFrame(rotationFrame);
  const step = () => {
    if (!globeRotating || projectionMode !== "globe") return;
    const center = map.getCenter();
    map.jumpTo({
      center: [center.lng + GLOBE_LONGITUDE_STEP, center.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    });
    rotationFrame = requestAnimationFrame(step);
  };
  rotationFrame = requestAnimationFrame(step);
}

function stopGlobeRotation(): void {
  globeRotating = false;
  cancelAnimationFrame(rotationFrame);
}

function interruptGlobeRotationFromUser(): void {
  if (!globeRotating) return;
  stopGlobeRotation();
  notifyRotationUi();
}

function bindGlobeRotationInterrupts(): void {
  const stop = () => interruptGlobeRotationFromUser();
  map.on("dragstart", stop);
  map.on("rotatestart", stop);
  map.on("pitchstart", stop);
  map.on("zoomstart", stop);
  map.on("dblclick", stop);
}

function applyProjection(mode: MapProjectionMode) {
  projectionMode = mode;
  if (mode === "globe") {
    map.setProjection({ type: "globe" });
    globeRotating = true;
    startGlobeRotation();
  } else {
    stopGlobeRotation();
    map.setProjection({ type: "mercator" });
  }
  void reloadLineLayers(map, mode);
  notifyRotationUi();
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
  bindGlobeRotationInterrupts();
});

window.addEventListener("resize", () => map.resize());
