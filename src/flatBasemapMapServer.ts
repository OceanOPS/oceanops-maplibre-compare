import type maplibregl from "maplibre-gl";
import type { BasemapKind } from "./basemap";
import {
  displayLngLatToWgs84,
  EQUAL_EARTH_MAPSERVER_WKT,
  wgs84BboxToEqualEarthMeters,
} from "./geoProjection";
import { getMapProjection } from "./mapProjectionState";
import {
  isCustomFlatBasemapProjection,
  isEqualEarthProjection,
  type ProjectionId,
} from "./projections";

export const OCEAN_MAP_SERVER =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer";

export const SATELLITE_MAP_SERVER =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";

const FLAT_BASEMAP_SOURCE_ID = "flat-basemap-image";
const FLAT_BASEMAP_LAYER_ID = "flat-basemap-image";
const MAX_EXPORT_SIZE = 2048;

function mapServerUrl(base: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params);
  return `${base}/export?${q.toString()}`;
}

function wgs84BboxFromDisplayBounds(
  bounds: maplibregl.LngLatBounds,
  projection: ProjectionId
): { west: number; south: number; east: number; north: number } {
  const corners = [
    bounds.getNorthWest(),
    bounds.getNorthEast(),
    bounds.getSouthEast(),
    bounds.getSouthWest(),
  ];
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const c of corners) {
    const [lon, lat] = displayLngLatToWgs84(c.lng, c.lat, projection);
    west = Math.min(west, lon);
    south = Math.min(south, lat);
    east = Math.max(east, lon);
    north = Math.max(north, lat);
  }
  return { west, south, east, north };
}

function buildExportUrl(
  projection: ProjectionId,
  kind: BasemapKind,
  west: number,
  south: number,
  east: number,
  north: number,
  width: number,
  height: number
): string {
  const base = kind === "satellite" ? SATELLITE_MAP_SERVER : OCEAN_MAP_SERVER;
  const size = `${Math.min(MAX_EXPORT_SIZE, Math.max(256, width))},${Math.min(
    MAX_EXPORT_SIZE,
    Math.max(256, height)
  )}`;

  if (isEqualEarthProjection(projection)) {
    const { xmin, ymin, xmax, ymax } = wgs84BboxToEqualEarthMeters(
      west,
      south,
      east,
      north
    );
    const sr = encodeURIComponent(JSON.stringify({ wkt: EQUAL_EARTH_MAPSERVER_WKT }));
    return mapServerUrl(base, {
      bbox: `${xmin},${ymin},${xmax},${ymax}`,
      bboxSR: sr,
      imageSR: sr,
      size,
      format: "png32",
      transparent: "false",
      f: "image",
    });
  }

  return mapServerUrl(base, {
    bbox: `${west},${south},${east},${north}`,
    bboxSR: "4326",
    imageSR: "4326",
    size,
    format: "png32",
    transparent: "false",
    f: "image",
  });
}

function ensureFlatBasemapLayer(map: maplibregl.Map): void {
  if (!map.getSource(FLAT_BASEMAP_SOURCE_ID)) {
    map.addSource(FLAT_BASEMAP_SOURCE_ID, {
      type: "image",
      url: "",
      coordinates: [
        [-180, 85],
        [180, 85],
        [180, -85],
        [-180, -85],
      ],
    });
  }
  if (!map.getLayer(FLAT_BASEMAP_LAYER_ID)) {
    map.addLayer(
      {
        id: FLAT_BASEMAP_LAYER_ID,
        type: "raster",
        source: FLAT_BASEMAP_SOURCE_ID,
        paint: { "raster-opacity": 1 },
      },
      map.getStyle().layers.find((l) => l.id !== "background")?.id
    );
  }
}

function setGlobeRasterLayersHidden(map: maplibregl.Map): void {
  for (const id of ["basemap-ocean", "basemap-satellite"] as const) {
    if (!map.getLayer(id)) continue;
    map.setLayoutProperty(id, "visibility", "none");
  }
}

function setFlatBasemapVisibility(map: maplibregl.Map, visible: boolean): void {
  if (map.getLayer(FLAT_BASEMAP_LAYER_ID)) {
    map.setLayoutProperty(FLAT_BASEMAP_LAYER_ID, "visibility", visible ? "visible" : "none");
  }
}

export function syncBasemapModeForProjection(
  map: maplibregl.Map,
  projection: ProjectionId,
  kind: BasemapKind
): void {
  const flat = isCustomFlatBasemapProjection(projection);
  if (flat) ensureFlatBasemapLayer(map);
  if (flat) {
    setGlobeRasterLayersHidden(map);
    setFlatBasemapVisibility(map, true);
    void refreshFlatBasemapImage(map, kind);
  } else {
    setFlatBasemapVisibility(map, false);
  }
}

export async function refreshFlatBasemapImage(
  map: maplibregl.Map,
  kind: BasemapKind
): Promise<void> {
  const projection = getMapProjection();
  if (!isCustomFlatBasemapProjection(projection)) return;

  const bounds = map.getBounds();
  const { west, south, east, north } = wgs84BboxFromDisplayBounds(bounds, projection);
  const canvas = map.getCanvas();
  const url = buildExportUrl(
    projection,
    kind,
    west,
    south,
    east,
    north,
    canvas.clientWidth,
    canvas.clientHeight
  );

  const nw = bounds.getNorthWest();
  const ne = bounds.getNorthEast();
  const se = bounds.getSouthEast();
  const sw = bounds.getSouthWest();

  const source = map.getSource(FLAT_BASEMAP_SOURCE_ID) as maplibregl.ImageSource | undefined;
  if (!source) return;

  source.updateImage({
    url,
    coordinates: [
      [nw.lng, nw.lat],
      [ne.lng, ne.lat],
      [se.lng, se.lat],
      [sw.lng, sw.lat],
    ],
  });
}

let moveTimer: ReturnType<typeof setTimeout> | null = null;

export function bindFlatBasemapRefresh(map: maplibregl.Map, getKind: () => BasemapKind): void {
  const schedule = () => {
    if (!isCustomFlatBasemapProjection(getMapProjection())) return;
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      moveTimer = null;
      void refreshFlatBasemapImage(map, getKind());
    }, 120);
  };
  map.on("moveend", schedule);
  map.on("resize", schedule);
}
