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
  toProjectionId,
  type MapProjectionMode,
} from "./layers";
import { mountFloatingToolbar, mountGlobeRotationControl } from "./floatingToolbar";
import { mountLegend } from "./legend";
import { registerMapAutoMotionStop } from "./mapAutoMotion";
import { bindMapInteractions } from "./mapInteractions";
import { mountMapDisplayMenu } from "./mapDisplayMenu";
import { createCountryFilterController } from "./countryFilterController";
import {
  createPlatformSearchBar,
  mountPlatformSearch,
  type PlatformSearchController,
} from "./platformSearch";
import {
  addMooringStackLayer,
  loadMooringStackData,
} from "./mooringStackLayer";
import {
  bindFlatBasemapRefresh,
  prefetchEqualEarthBasemaps,
  syncBasemapModeForProjection,
} from "./flatBasemapMapServer";
import { setMapProjection } from "./mapProjectionState";
import {
  applyProjectionShellLayout,
  applyProjectionViewConstraints,
  scheduleEqualEarthRefit,
} from "./projectionLayout";
import { is3dProjection } from "./projections";
import {
  beginInitialMapLoad,
  endInitialMapLoad,
  ensureBasemapLoader,
} from "./basemapLoader";
import { disableGlobeTerrain, enableGlobeTerrain } from "./globeTerrain";
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

ensureBasemapLoader();
beginInitialMapLoad();

const onShellLayoutChange = () => {
  map.resize();
  if (projectionMode === "equal-earth") {
    scheduleEqualEarthRefit(map);
  }
};

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
    prefetchEqualEarthBasemaps(kind);
    applyBasemapForCurrentProjection();
  },
  getProjection: () => projectionMode,
  onProjectionChange: async (mode) => {
    await applyProjection(mode);
  },
  onShellLayoutChange,
});
displayMenu.classList.add("esri-component");
toolbarHost.appendChild(displayMenu);

let platformSearch: PlatformSearchController | null = null;
const searchChrome = createPlatformSearchBar({
  getSearch: () => platformSearch,
});
const searchWrap = document.createElement("div");
searchWrap.className = "esri-component";
searchWrap.appendChild(searchChrome.searchBar);
toolbarHost.appendChild(searchWrap);

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
  // Stop on press so a click is not lost: rotation moves the camera between
  // mousedown and mouseup, which otherwise cancels MapLibre's click.
  map.on("mousedown", stop);
  map.on("touchstart", stop);
  map.on("click", stop);
  map.on("dragstart", stop);
  map.on("rotatestart", stop);
  map.on("pitchstart", stop);
  map.on("zoomstart", stop);
  map.on("dblclick", stop);
}

function applyBasemapForCurrentProjection(): void {
  const projection = toProjectionId(projectionMode);
  if (is3dProjection(projection)) {
    setBasemapKind(map, basemapKind);
  }
  syncBasemapModeForProjection(map, projection, basemapKind);
}

async function applyProjection(mode: MapProjectionMode): Promise<void> {
  const leavingEqualEarth = projectionMode === "equal-earth" && mode !== "equal-earth";
  projectionMode = mode;
  const projection = toProjectionId(mode);
  setMapProjection(projection);
  applyProjectionShellLayout(projection);

  if (mode === "globe") {
    // No fog on globe: fog horizon-blend reads as “transparent ocean” and bleeds
    // through to markers on the far side during fast spins.
    if ("setFog" in map && typeof map.setFog === "function") map.setFog(null);
    map.setProjection({ type: "globe" });
    enableGlobeTerrain(map);
    applyProjectionViewConstraints(map, projection, {
      resetCamera: leavingEqualEarth,
    });
    globeRotating = true;
    startGlobeRotation();
  } else {
    stopGlobeRotation();
    disableGlobeTerrain(map);
    if ("setFog" in map && typeof map.setFog === "function") map.setFog(null);
    map.setProjection({ type: "mercator" });
    applyProjectionViewConstraints(map, projection, {
      resetCamera: leavingEqualEarth || mode === "equal-earth",
    });
  }

  applyBasemapForCurrentProjection();

  if (countryFilter) {
    await reloadLineLayers(map, mode);
    countryFilter.apply();
    platformSearch?.rebuild();
  }

  notifyRotationUi();
  (displayMenu as HTMLDivElement & { refresh?: () => void }).refresh?.();
}

map.on("load", async () => {
  try {
    ensureBasemapSources(map);
    bindFlatBasemapRefresh(map, () => basemapKind);
    prefetchEqualEarthBasemaps(basemapKind);
    setBasemapKind(map, basemapKind);
    await applyProjection("globe");

    const mooringData = await loadMooringStackData("/");
    await loadAllCategories(map, projectionMode, mooringData);
    await addMooringStackLayer(map, mooringData.stackLayer);

    for (const cat of categories) {
      if (!isCategoryVisible(cat)) setCategoryVisible(map, cat, false);
    }

    countryFilter = createCountryFilterController(map);
    countryFilter.apply();
    legendUi.refreshCounts();

    registerMapAutoMotionStop(interruptGlobeRotationFromUser);
    bindMapInteractions(map);
    bindGlobeRotationInterrupts();

    const searchAnchor = document.getElementById("platform-search-anchor");
    if (searchAnchor) {
      platformSearch = mountPlatformSearch({
        shell: searchAnchor,
        map,
        stopRotation: () => interruptGlobeRotationFromUser(),
        getProjection: () => projectionMode,
      });
      platformSearch.setOpenChangeListener(searchChrome.syncSearchButton);
      searchChrome.syncSearchButton();
    }
  } finally {
    endInitialMapLoad();
  }
});

window.addEventListener("resize", () => map.resize());
