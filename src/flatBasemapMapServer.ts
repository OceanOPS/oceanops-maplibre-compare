import type maplibregl from "maplibre-gl";
import type { BasemapKind } from "./basemap";
import {
  displayLngLatToWgs84,
  EQUAL_EARTH_MAPSERVER_WKT,
  EQUAL_EARTH_WORLD_HALF_X,
  EQUAL_EARTH_WORLD_HALF_Y,
  equalEarthWorldDisplayCoordinates,
  paintNavyOutsideEqualEarth,
  wgs84BboxToEqualEarthMeters,
  type EqualEarthMeterExtent,
} from "./geoProjection";
import { getMapProjection } from "./mapProjectionState";
import { getEqualEarthFitZoom } from "./projectionLayout";
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
const WORLD_EXPORT_WIDTH = 2048;
const WORLD_EXPORT_HEIGHT = Math.max(
  256,
  Math.round(
    WORLD_EXPORT_WIDTH * (EQUAL_EARTH_WORLD_HALF_Y / EQUAL_EARTH_WORLD_HALF_X)
  )
);

type ImageCoordinates = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

function mapServerUrl(base: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params);
  return `${base}/export?${q.toString()}`;
}

function mapServerBase(kind: BasemapKind): string {
  return kind === "satellite" ? SATELLITE_MAP_SERVER : OCEAN_MAP_SERVER;
}

function equalEarthSrJson(): string {
  return JSON.stringify({ wkt: EQUAL_EARTH_MAPSERVER_WKT });
}

function equalEarthExportUrl(
  kind: BasemapKind,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
  width: number,
  height: number
): string {
  const sr = equalEarthSrJson();
  const size = `${Math.min(MAX_EXPORT_SIZE, Math.max(256, width))},${Math.min(
    MAX_EXPORT_SIZE,
    Math.max(256, height)
  )}`;
  return mapServerUrl(mapServerBase(kind), {
    bbox: `${xmin},${ymin},${xmax},${ymax}`,
    bboxSR: sr,
    imageSR: sr,
    size,
    format: "png32",
    transparent: "true",
    f: "image",
  });
}

const EQUAL_EARTH_WORLD_EXTENT: EqualEarthMeterExtent = {
  xmin: -EQUAL_EARTH_WORLD_HALF_X,
  ymin: -EQUAL_EARTH_WORLD_HALF_Y,
  xmax: EQUAL_EARTH_WORLD_HALF_X,
  ymax: EQUAL_EARTH_WORLD_HALF_Y,
};

/** Stable world-extent URL so Esri + the browser can cache it (unlike per-viewport bbox). */
export function equalEarthWorldExportUrl(kind: BasemapKind): string {
  return equalEarthExportUrl(
    kind,
    -EQUAL_EARTH_WORLD_HALF_X,
    -EQUAL_EARTH_WORLD_HALF_Y,
    EQUAL_EARTH_WORLD_HALF_X,
    EQUAL_EARTH_WORLD_HALF_Y,
    WORLD_EXPORT_WIDTH,
    WORLD_EXPORT_HEIGHT
  );
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

function plateCarreeExportUrl(
  kind: BasemapKind,
  west: number,
  south: number,
  east: number,
  north: number,
  width: number,
  height: number
): string {
  const size = `${Math.min(MAX_EXPORT_SIZE, Math.max(256, width))},${Math.min(
    MAX_EXPORT_SIZE,
    Math.max(256, height)
  )}`;
  return mapServerUrl(mapServerBase(kind), {
    bbox: `${west},${south},${east},${north}`,
    bboxSR: "4326",
    imageSR: "4326",
    size,
    format: "png32",
    transparent: "false",
    f: "image",
  });
}

function firstNonBackgroundLayerId(map: maplibregl.Map): string | undefined {
  return map.getStyle().layers.find((layer) => layer.id !== "background")?.id;
}

function ensureFlatBasemapLayer(
  map: maplibregl.Map,
  url: string,
  coordinates: ImageCoordinates
): maplibregl.ImageSource | undefined {
  if (!map.getSource(FLAT_BASEMAP_SOURCE_ID)) {
    map.addSource(FLAT_BASEMAP_SOURCE_ID, {
      type: "image",
      url,
      coordinates,
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
      firstNonBackgroundLayerId(map)
    );
  }
  return map.getSource(FLAT_BASEMAP_SOURCE_ID) as maplibregl.ImageSource | undefined;
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

function isWorldScaleView(map: maplibregl.Map): boolean {
  const fitted = getEqualEarthFitZoom();
  const worldZoom = fitted ?? map.getMinZoom();
  return map.getZoom() <= worldZoom + 0.25;
}

const decodedByUrl = new Map<string, Promise<string>>();
let appliedUrl: string | null = null;
let refreshGeneration = 0;

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Equal Earth basemap export failed"));
    img.src = url;
  });
}

async function navyEqualEarthDisplayUrl(
  url: string,
  extent: EqualEarthMeterExtent
): Promise<string> {
  const img = await loadHtmlImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return url;
  ctx.fillStyle = "#0b1e42";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  paintNavyOutsideEqualEarth(imageData, extent);
  ctx.putImageData(imageData, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  return blob ? URL.createObjectURL(blob) : url;
}

function preloadBasemapImage(
  url: string,
  equalEarthExtent?: EqualEarthMeterExtent
): Promise<string> {
  const hit = decodedByUrl.get(url);
  if (hit) return hit;
  const pending = (async () => {
    try {
      if (equalEarthExtent) return await navyEqualEarthDisplayUrl(url, equalEarthExtent);
      await loadHtmlImage(url);
      return url;
    } catch (error) {
      decodedByUrl.delete(url);
      throw error;
    }
  })();
  decodedByUrl.set(url, pending);
  return pending;
}

export function prefetchEqualEarthBasemaps(kind: BasemapKind = "map"): void {
  void preloadBasemapImage(equalEarthWorldExportUrl(kind), EQUAL_EARTH_WORLD_EXTENT);
}

function viewportCoordinates(map: maplibregl.Map): ImageCoordinates {
  const bounds = map.getBounds();
  const nw = bounds.getNorthWest();
  const ne = bounds.getNorthEast();
  const se = bounds.getSouthEast();
  const sw = bounds.getSouthWest();
  return [
    [nw.lng, nw.lat],
    [ne.lng, ne.lat],
    [se.lng, se.lat],
    [sw.lng, sw.lat],
  ];
}

export function syncBasemapModeForProjection(
  map: maplibregl.Map,
  projection: ProjectionId,
  kind: BasemapKind
): void {
  const flat = isCustomFlatBasemapProjection(projection);
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

  const canvas = map.getCanvas();
  let url: string;
  let coordinates: ImageCoordinates;
  let equalEarthExtent: EqualEarthMeterExtent | undefined;

  if (isEqualEarthProjection(projection) && isWorldScaleView(map)) {
    url = equalEarthWorldExportUrl(kind);
    equalEarthExtent = EQUAL_EARTH_WORLD_EXTENT;
    // Must pin the full-world Equal Earth export to the warped quadrilateral in
    // display space — not the rectangular map viewport (that stretched the image
    // over the screen and broke alignment with layers / tile basemap bleed).
    coordinates = equalEarthWorldDisplayCoordinates();
  } else if (isEqualEarthProjection(projection)) {
    const bounds = map.getBounds();
    const { west, south, east, north } = wgs84BboxFromDisplayBounds(bounds, projection);
    const { xmin, ymin, xmax, ymax } = wgs84BboxToEqualEarthMeters(
      west,
      south,
      east,
      north
    );
    equalEarthExtent = { xmin, ymin, xmax, ymax };
    url = equalEarthExportUrl(
      kind,
      xmin,
      ymin,
      xmax,
      ymax,
      canvas.clientWidth,
      canvas.clientHeight
    );
    coordinates = viewportCoordinates(map);
  } else {
    const bounds = map.getBounds();
    const { west, south, east, north } = wgs84BboxFromDisplayBounds(bounds, projection);
    url = plateCarreeExportUrl(
      kind,
      west,
      south,
      east,
      north,
      canvas.clientWidth,
      canvas.clientHeight
    );
    coordinates = viewportCoordinates(map);
  }

  if (url === appliedUrl && map.getLayer(FLAT_BASEMAP_LAYER_ID)) {
    setGlobeRasterLayersHidden(map);
    setFlatBasemapVisibility(map, true);
    return;
  }

  const generation = ++refreshGeneration;
  let displayUrl: string;
  try {
    displayUrl = await preloadBasemapImage(url, equalEarthExtent);
  } catch (error) {
    console.warn(error);
    return;
  }
  if (generation !== refreshGeneration) return;
  if (getMapProjection() !== projection) return;

  const hadSource = Boolean(map.getSource(FLAT_BASEMAP_SOURCE_ID));
  const source = ensureFlatBasemapLayer(map, displayUrl, coordinates);
  if (!source) return;
  if (hadSource) source.updateImage({ url: displayUrl, coordinates });
  appliedUrl = url;
  setGlobeRasterLayersHidden(map);
  setFlatBasemapVisibility(map, true);
}

let moveTimer: ReturnType<typeof setTimeout> | null = null;

export function bindFlatBasemapRefresh(map: maplibregl.Map, getKind: () => BasemapKind): void {
  const schedule = () => {
    if (!isCustomFlatBasemapProjection(getMapProjection())) return;
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      moveTimer = null;
      void refreshFlatBasemapImage(map, getKind());
    }, 200);
  };
  map.on("moveend", schedule);
  map.on("resize", schedule);
}
