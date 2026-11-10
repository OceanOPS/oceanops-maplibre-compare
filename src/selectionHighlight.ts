import type maplibregl from "maplibre-gl";

/** Subtle selection ring — stroke only, no fill. */
const RING_STROKE = "rgba(72, 82, 94, 0.88)";
const LINE_STROKE = "rgba(72, 82, 94, 0.92)";

const SOURCE_ID = "oceanops-selection-highlight";
const LINE_SOURCE_ID = "oceanops-selection-highlight-line";
const LAYER_RING_ID = "oceanops-selection-highlight-ring";
const LAYER_LINE_ID = "oceanops-selection-highlight-line";

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
  if (map.getLayer(LAYER_LINE_ID)) map.moveLayer(LAYER_LINE_ID);
  if (map.getLayer(LAYER_RING_ID)) map.moveLayer(LAYER_RING_ID);
}

const LEGACY_FILL_LAYER = "oceanops-selection-highlight-fill";

export type SelectionHighlightStyle = "marker" | "line" | "none";

function lineGeometryFromFeature(
  feature: GeoJSON.Feature
): GeoJSON.LineString | GeoJSON.MultiLineString | null {
  const g = feature.geometry;
  if (!g) return null;
  if (g.type === "LineString" || g.type === "MultiLineString") return g;
  return null;
}

export function ensureSelectionHighlightLayers(map: maplibregl.Map): void {
  if (map.getLayer(LEGACY_FILL_LAYER)) map.removeLayer(LEGACY_FILL_LAYER);

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getSource(LINE_SOURCE_ID)) {
    map.addSource(LINE_SOURCE_ID, {
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

  if (!map.getLayer(LAYER_LINE_ID)) {
    map.addLayer({
      id: LAYER_LINE_ID,
      type: "line",
      source: LINE_SOURCE_ID,
      paint: {
        "line-color": LINE_STROKE,
        "line-width": 3.25,
        "line-opacity": 1,
      },
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
    });
  }

  bringSelectionHighlightToFront(map);
}

function clearMarkerHighlight(map: maplibregl.Map): void {
  if (!map.getSource(SOURCE_ID)) return;
  const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
  src.setData({ type: "FeatureCollection", features: [] });
}

function clearLineHighlight(map: maplibregl.Map): void {
  if (!map.getSource(LINE_SOURCE_ID)) return;
  const src = map.getSource(LINE_SOURCE_ID) as maplibregl.GeoJSONSource;
  src.setData({ type: "FeatureCollection", features: [] });
}

export function setSelectionHighlight(
  map: maplibregl.Map,
  options: {
    lngLat: { lng: number; lat: number };
    style?: SelectionHighlightStyle;
    feature?: GeoJSON.Feature;
  }
): void {
  const style = options.style ?? "marker";
  ensureSelectionHighlightLayers(map);

  if (style === "line" && options.feature) {
    clearMarkerHighlight(map);
    const geometry = lineGeometryFromFeature(options.feature);
    const lineSrc = map.getSource(LINE_SOURCE_ID) as maplibregl.GeoJSONSource;
    if (geometry) {
      lineSrc.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry,
            properties: {},
          },
        ],
      });
    } else {
      clearLineHighlight(map);
    }
  } else if (style === "marker") {
    clearLineHighlight(map);
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
    src.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [options.lngLat.lng, options.lngLat.lat],
          },
          properties: {},
        },
      ],
    });
  } else {
    clearMarkerHighlight(map);
    clearLineHighlight(map);
  }

  bringSelectionHighlightToFront(map);
}

export function clearSelectionHighlight(map: maplibregl.Map): void {
  clearMarkerHighlight(map);
  clearLineHighlight(map);
}
