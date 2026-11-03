import type maplibregl from "maplibre-gl";

export type BasemapKind = "map" | "satellite";

export const OCEAN_TILES =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}";

export const SATELLITE_TILES =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const BASEMAP_LAYER_IDS = ["basemap-ocean", "basemap-satellite"] as const;

export function emptyStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#0b1e42" },
      },
    ],
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  };
}

export function ensureBasemapSources(map: maplibregl.Map): void {
  if (!map.getSource("basemap-ocean")) {
    map.addSource("basemap-ocean", {
      type: "raster",
      tiles: [OCEAN_TILES],
      tileSize: 256,
      attribution: "Esri — Ocean Basemap",
    });
  }
  if (!map.getSource("basemap-satellite")) {
    map.addSource("basemap-satellite", {
      type: "raster",
      tiles: [SATELLITE_TILES],
      tileSize: 256,
      attribution: "Esri — World Imagery",
    });
  }

  if (!map.getLayer("basemap-ocean")) {
    map.addLayer({
      id: "basemap-ocean",
      type: "raster",
      source: "basemap-ocean",
      layout: { visibility: "visible" },
    });
  }
  if (!map.getLayer("basemap-satellite")) {
    map.addLayer({
      id: "basemap-satellite",
      type: "raster",
      source: "basemap-satellite",
      layout: { visibility: "none" },
    });
  }
}

export function setBasemapKind(map: maplibregl.Map, kind: BasemapKind): void {
  ensureBasemapSources(map);
  map.setLayoutProperty(
    "basemap-ocean",
    "visibility",
    kind === "map" ? "visible" : "none"
  );
  map.setLayoutProperty(
    "basemap-satellite",
    "visibility",
    kind === "satellite" ? "visible" : "none"
  );
}

export function moveBasemapBelowData(map: maplibregl.Map, firstDataLayerId: string): void {
  if (!map.getLayer(firstDataLayerId)) return;
  for (const id of BASEMAP_LAYER_IDS) {
    if (map.getLayer(id)) map.moveLayer(id, firstDataLayerId);
  }
}
