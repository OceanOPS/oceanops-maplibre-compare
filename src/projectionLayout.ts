import type maplibregl from "maplibre-gl";
import { equalEarthWorldDisplayBoundsDense } from "./geoProjection";
import { GLOBE_TERRAIN_PITCH_DEG } from "./globeTerrain";
import {
  is3dProjection,
  isCustomFlatBasemapProjection,
  isEqualEarthProjection,
  type ProjectionId,
} from "./projections";

let equalEarthFitZoom: number | null = null;
let equalEarthRefitRaf = 0;

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

function frameEqualEarthViewNow(map: maplibregl.Map): void {
  if (typeof map.setRenderWorldCopies === "function") {
    map.setRenderWorldCopies(false);
  }
  map.setMaxBounds(null);
  map.setMinZoom(-2);

  const bounds = equalEarthWorldDisplayBoundsDense() as [[number, number], [number, number]];

  map.stop();
  map.fitBounds(bounds, {
    padding: 16,
    bearing: 0,
    pitch: 0,
    duration: 0,
    maxZoom: 24,
  });

  const zoom = map.getZoom();
  equalEarthFitZoom = zoom;
  map.setMinZoom(zoom);

  map.setMaxBounds(map.getBounds());
}

/**
 * Equal Earth: fit the full oval after layout (legend width, fonts, first paint) so
 * initial view is not cropped when the container was not at final size.
 */
export function scheduleEqualEarthRefit(map: maplibregl.Map): void {
  cancelAnimationFrame(equalEarthRefitRaf);
  equalEarthRefitRaf = requestAnimationFrame(() => {
    equalEarthRefitRaf = requestAnimationFrame(() => {
      equalEarthRefitRaf = 0;
      map.resize();
      frameEqualEarthViewNow(map);
    });
  });
}

/** Fit Equal Earth onto the mercator display grid and lock zoom-out at that framing. */
export function frameEqualEarthView(map: maplibregl.Map): void {
  frameEqualEarthViewNow(map);
  scheduleEqualEarthRefit(map);
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
    pitch: GLOBE_TERRAIN_PITCH_DEG,
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
