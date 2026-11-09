/** Geographic anchor for popups / selection — always the feature point, not the click. */
export function featureAnchorLngLat(
  feature: GeoJSON.Feature,
  fallback: { lng: number; lat: number }
): { lng: number; lat: number } {
  const g = feature.geometry;
  if (!g) return fallback;
  if (g.type === "Point") {
    const [lng, lat] = g.coordinates as [number, number];
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
  }
  if (g.type === "MultiPoint") {
    const c = g.coordinates[0] as [number, number] | undefined;
    if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
      return { lng: c[0], lat: c[1] };
    }
  }
  return fallback;
}
