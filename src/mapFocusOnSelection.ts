import type maplibregl from "maplibre-gl";
import { stopMapAutoMotion } from "./mapAutoMotion";

export function focusMapOnLngLat(
  map: maplibregl.Map,
  lngLat: { lng: number; lat: number }
): void {
  stopMapAutoMotion();
  const isGlobe = map.getProjection().type === "globe";
  const minZoom = isGlobe ? 4.5 : 6.5;
  const zoom = Math.max(map.getZoom(), minZoom);
  map.flyTo({
    center: [lngLat.lng, lngLat.lat],
    zoom,
    duration: 650,
    essential: true,
  });
}
