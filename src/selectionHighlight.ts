import type maplibregl from "maplibre-gl";

/** Subtle selection ring — stroke only, no fill. */
const RING_STROKE = "rgba(72, 82, 94, 0.88)";

const SOURCE_ID = "oceanops-selection-highlight";
const LAYER_RING_ID = "oceanops-selection-highlight-ring";

const RADIUS_RING: maplibregl.ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  1,
  10,
  4,
  15,
  8,
  21,
  12,
  28,
];

function bringSelectionHighlightToFront(map: maplibregl.Map): void {
  if (map.getLayer(LAYER_RING_ID)) map.moveLayer(LAYER_RING_ID);
}

const LEGACY_FILL_LAYER = "oceanops-selection-highlight-fill";

export function ensureSelectionHighlightLayers(map: maplibregl.Map): void {
  if (map.getLayer(LEGACY_FILL_LAYER)) map.removeLayer(LEGACY_FILL_LAYER);

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(LAYER_RING_ID)) {
    map.addLayer({
      id: LAYER_RING_ID,
      type: "circle",
      source: SOURCE_ID,
      paint: {
        "circle-pitch-alignment": "map",
        "circle-radius": RADIUS_RING,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": RING_STROKE,
        "circle-stroke-width": 1.75,
        "circle-stroke-opacity": 1,
      },
    });
  }

  bringSelectionHighlightToFront(map);
}

export function setSelectionHighlight(
  map: maplibregl.Map,
  lngLat: { lng: number; lat: number }
): void {
  ensureSelectionHighlightLayers(map);
  const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
  src.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lngLat.lng, lngLat.lat] },
        properties: {},
      },
    ],
  });
  bringSelectionHighlightToFront(map);
}

export function clearSelectionHighlight(map: maplibregl.Map): void {
  if (!map.getSource(SOURCE_ID)) return;
  const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
  src.setData({ type: "FeatureCollection", features: [] });
}
