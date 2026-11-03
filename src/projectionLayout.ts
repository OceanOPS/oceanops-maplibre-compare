import {
  is3dProjection,
  isCustomFlatBasemapProjection,
  type ProjectionId,
} from "./projections";

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
