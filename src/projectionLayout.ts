import type maplibregl from "maplibre-gl";
import { displayBoundsForWorld } from "./geoProjection";
import {
  is3dProjection,
  isCustomFlatBasemapProjection,
  isEqualEarthProjection,
  PROJECTION_EQUAL_EARTH,
  type ProjectionId,
} from "./projections";

let equalEarthFitZoom: number | null = null;

export function getEqualEarthFitZoom(): number | null {
  return equalEarthFitZoom;
}

const DEFAULT_FLAT_CENTER: [number, number] = [-150, 10];
const DEFAULT_FLAT_ZOOM = 2.7;

/** Projection-specific body classes (mirrors oceanops-simple-map). */
export function applyProjectionShellLayout(projection: ProjectionId): void {
  document.body.classList.remove(
    "flat-projection",
    "globe-projection",
    "flat-mapserver-basemap"
  );
  if (is3dProjection(projection)) {
    document.body.classList.add("globe-projection");
    return;
  }
  document.body.classList.add("flat-projection");
  if (isCustomFlatBasemapProjection(projection)) {
    document.body.classList.add("flat-mapserver-basemap");
  }
}

/** Fit Equal Earth onto the mercator display grid and lock zoom-out at that framing. */
export function frameEqualEarthView(map: maplibregl.Map): void {
  if (typeof map.setRenderWorldCopies === "function") {
    map.setRenderWorldCopies(false);
  }
  map.setMaxBounds(null);
  map.setMinZoom(-2);
  const bounds = displayBoundsForWorld(PROJECTION_EQUAL_EARTH);
  const camera = map.cameraForBounds(bounds, { padding: 12, bearing: 0, pitch: 0 });
  if (camera?.center != null && camera.zoom != null) {
    map.jumpTo({
      center: camera.center,
      zoom: camera.zoom,
      bearing: 0,
      pitch: 0,
    });
    map.setMinZoom(camera.zoom);
    equalEarthFitZoom = camera.zoom;
  }
  map.setMaxBounds(bounds);
}

export function restoreDefaultWorldView(map: maplibregl.Map): void {
  if (typeof map.setRenderWorldCopies === "function") {
    map.setRenderWorldCopies(true);
  }
  map.setMaxBounds(null);
  map.setMinZoom(-2);
  map.jumpTo({
    center: DEFAULT_FLAT_CENTER,
    zoom: DEFAULT_FLAT_ZOOM,
    bearing: 0,
    pitch: 0,
  });
}

export function applyProjectionViewConstraints(
  map: maplibregl.Map,
  projection: ProjectionId,
  options?: { resetCamera?: boolean }
): void {
  if (isEqualEarthProjection(projection)) {
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    frameEqualEarthView(map);
    return;
  }
  map.dragRotate.enable();
  map.touchZoomRotate.enableRotation();
  if (options?.resetCamera === false) {
    if (typeof map.setRenderWorldCopies === "function") {
      map.setRenderWorldCopies(true);
    }
    map.setMaxBounds(null);
    map.setMinZoom(-2);
    return;
  }
  restoreDefaultWorldView(map);
}
