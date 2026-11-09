import type maplibregl from "maplibre-gl";
import type { BasemapKind } from "./basemap";
import {
  EQUAL_EARTH_MAPSERVER_WKT,
  EQUAL_EARTH_WORLD_HALF_X,
  EQUAL_EARTH_WORLD_HALF_Y,
  displayLngLatToWgs84,
  equalEarthMetersExtentToDisplayCoordinates,
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
  PROJECTION_EQUAL_EARTH,
  type ProjectionId,
} from "./projections";
import {
  beginBasemapWorldLoad,
  beginBasemapZoomLoad,
  endBasemapLayerLoad,
  resetBasemapLoader,
  setBasemapLoaderProgress,
} from "./basemapLoader";

export const OCEAN_MAP_SERVER =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer";

export const SATELLITE_MAP_SERVER =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";

/** Cached full-world Equal Earth image — always kept when zooming. */
const FLAT_WORLD_SOURCE_ID = "flat-basemap-world";
const FLAT_WORLD_LAYER_ID = "flat-basemap-world";
/** High-res viewport export stacked above the world layer while zoomed in. */
const FLAT_DETAIL_SOURCE_ID = "flat-basemap-detail";
const FLAT_DETAIL_LAYER_ID = "flat-basemap-detail";
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

const FLAT_BASEMAP_LAYER_IDS = new Set([FLAT_WORLD_LAYER_ID, FLAT_DETAIL_LAYER_ID]);

/** First layer that is not background or our flat basemap stack (so inserts stay below data). */
function anchorBelowDataLayerId(map: maplibregl.Map): string | undefined {
  return map.getStyle().layers.find(
    (layer) => layer.id !== "background" && !FLAT_BASEMAP_LAYER_IDS.has(layer.id)
  )?.id;
}

function ensureImageRasterLayer(
  map: maplibregl.Map,
  sourceId: string,
  layerId: string,
  url: string,
  coordinates: ImageCoordinates,
  insertBefore?: string
): maplibregl.ImageSource | undefined {
  const before = insertBefore ?? anchorBelowDataLayerId(map);
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "image",
      url,
      coordinates,
    });
  }
  if (!map.getLayer(layerId)) {
    map.addLayer(
      {
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: { "raster-opacity": 1, "raster-fade-duration": 0 },
      },
      before
    );
  }
  return map.getSource(sourceId) as maplibregl.ImageSource | undefined;
}

/** World then detail, both directly under observatory layers. */
function stackFlatBasemapLayers(map: maplibregl.Map): void {
  const before = anchorBelowDataLayerId(map);
  if (!before) return;
  if (map.getLayer(FLAT_WORLD_LAYER_ID)) {
    map.moveLayer(FLAT_WORLD_LAYER_ID, before);
  }
  if (map.getLayer(FLAT_DETAIL_LAYER_ID)) {
    map.moveLayer(FLAT_DETAIL_LAYER_ID, before);
  }
}

function showWorldBasemapOnly(map: maplibregl.Map): void {
  setLayerVisible(map, FLAT_WORLD_LAYER_ID, true);
  setLayerVisible(map, FLAT_DETAIL_LAYER_ID, false);
}

function showDetailBasemapOnly(map: maplibregl.Map): void {
  stackFlatBasemapLayers(map);
  setLayerVisible(map, FLAT_WORLD_LAYER_ID, false);
  setLayerVisible(map, FLAT_DETAIL_LAYER_ID, true);
}

function setLayerVisible(map: maplibregl.Map, layerId: string, visible: boolean): void {
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

function setGlobeRasterLayersHidden(map: maplibregl.Map): void {
  for (const id of ["basemap-ocean", "basemap-satellite"] as const) {
    if (!map.getLayer(id)) continue;
    map.setLayoutProperty(id, "visibility", "none");
  }
}

function setFlatBasemapVisibility(map: maplibregl.Map, visible: boolean): void {
  setLayerVisible(map, FLAT_WORLD_LAYER_ID, visible);
  setLayerVisible(map, FLAT_DETAIL_LAYER_ID, visible);
}

function setDetailBasemapVisible(map: maplibregl.Map, visible: boolean): void {
  if (visible) showDetailBasemapOnly(map);
  else setLayerVisible(map, FLAT_DETAIL_LAYER_ID, false);
}

const decodedByUrl = new Map<string, Promise<string>>();
let appliedWorldKind: BasemapKind | null = null;
/** Display URL for the cached world layer (object URL from navy compositing). */
let appliedWorldDisplayUrl: string | null = null;
/** Last viewport detail key applied on the detail layer. */
let appliedDetailKey: string | null = null;
let refreshGeneration = 0;
let viewRefreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Any zoom above fit + this requests a viewport MapServer export. */
const WORLD_ZOOM_MARGIN = 0.05;
/** Fallback until Equal Earth fitBounds has set {@link getEqualEarthFitZoom}. */
const DEFAULT_EQUAL_EARTH_FIT_ZOOM = 2.7;
const VIEW_REFRESH_DEBOUNCE_MS = 350;

function loadHtmlImageFromObjectUrl(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Equal Earth basemap image decode failed"));
    img.src = objectUrl;
  });
}

/**
 * Download PNG with byte progress when `Content-Length` is present (often on same-origin
 * or when the CDN sends it). Otherwise finishes with a single 100% after `blob()`.
 */
async function fetchImageBlobWithProgress(
  url: string,
  onProgress: (percent: number | null) => void
): Promise<Blob> {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) {
    throw new Error(`Basemap request failed: ${res.status}`);
  }
  const raw = res.headers.get("content-length");
  const total = raw ? Number.parseInt(raw, 10) : NaN;
  const body = res.body;
  const type = res.headers.get("content-type") ?? "image/png";

  if (!body || !Number.isFinite(total) || total <= 0) {
    onProgress(null);
    const blob = await res.blob();
    onProgress(100);
    return blob;
  }

  const reader = body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  onProgress(0);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress(Math.min(99, Math.round((received / total) * 100)));
    }
  }
  onProgress(100);
  return new Blob(chunks, { type });
}

async function navyEqualEarthDisplayUrl(
  url: string,
  extent: EqualEarthMeterExtent,
  onProgress?: (percent: number | null) => void
): Promise<string> {
  const imageBlob = await fetchImageBlobWithProgress(url, (p) => onProgress?.(p));
  const imageObjectUrl = URL.createObjectURL(imageBlob);
  let img: HTMLImageElement;
  try {
    onProgress?.(null);
    img = await loadHtmlImageFromObjectUrl(imageObjectUrl);
  } finally {
    URL.revokeObjectURL(imageObjectUrl);
  }
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return url;
  }
  ctx.fillStyle = "#0b1e42";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  paintNavyOutsideEqualEarth(imageData, extent);
  ctx.putImageData(imageData, 0, 0);
  onProgress?.(null);
  const pngBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  onProgress?.(100);
  return pngBlob ? URL.createObjectURL(pngBlob) : url;
}

function preloadBasemapImage(
  url: string,
  equalEarthExtent?: EqualEarthMeterExtent,
  onProgress?: (percent: number | null) => void
): Promise<string> {
  const hit = decodedByUrl.get(url);
  if (hit) {
    onProgress?.(100);
    return hit;
  }
  const pending = (async () => {
    try {
      if (equalEarthExtent) {
        return await navyEqualEarthDisplayUrl(url, equalEarthExtent, onProgress);
      }
      onProgress?.(100);
      return url;
    } catch (error) {
      decodedByUrl.delete(url);
      throw error;
    }
  })();
  decodedByUrl.set(url, pending);
  return pending;
}

function mapViewportWgs84Bbox(map: maplibregl.Map): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  const b = map.getBounds();
  const corners: [number, number][] = [
    [b.getWest(), b.getNorth()],
    [b.getEast(), b.getNorth()],
    [b.getEast(), b.getSouth()],
    [b.getWest(), b.getSouth()],
  ];
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of corners) {
    const [lon, la] = displayLngLatToWgs84(lng, lat, PROJECTION_EQUAL_EARTH);
    west = Math.min(west, lon);
    south = Math.min(south, la);
    east = Math.max(east, lon);
    north = Math.max(north, la);
  }
  return { west, south, east, north };
}

function exportPixelSize(map: maplibregl.Map): { width: number; height: number } {
  const canvas = map.getCanvas();
  const dpr = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
  const width = Math.min(
    MAX_EXPORT_SIZE,
    Math.max(640, Math.round(canvas.clientWidth * dpr))
  );
  const height = Math.min(
    MAX_EXPORT_SIZE,
    Math.max(480, Math.round(canvas.clientHeight * dpr))
  );
  return { width, height };
}

function useWorldExtentBasemap(map: maplibregl.Map): boolean {
  const fit = getEqualEarthFitZoom() ?? DEFAULT_EQUAL_EARTH_FIT_ZOOM;
  return map.getZoom() <= fit + WORLD_ZOOM_MARGIN;
}

type ViewportBasemapRequest = {
  key: string;
  url: string;
  extent: EqualEarthMeterExtent;
  coordinates: ImageCoordinates;
};

function resolveViewportBasemapRequest(
  map: maplibregl.Map,
  kind: BasemapKind
): ViewportBasemapRequest {
  const { west, south, east, north } = mapViewportWgs84Bbox(map);
  const extent = wgs84BboxToEqualEarthMeters(west, south, east, north);
  const { width, height } = exportPixelSize(map);
  const url = equalEarthExportUrl(
    kind,
    extent.xmin,
    extent.ymin,
    extent.xmax,
    extent.ymax,
    width,
    height
  );
  const z = map.getZoom().toFixed(2);
  const key = `${kind}:view:z${z}:${extent.xmin.toFixed(0)}:${extent.ymin.toFixed(0)}:${extent.xmax.toFixed(0)}:${extent.ymax.toFixed(0)}:${width}x${height}`;
  return {
    key,
    url,
    extent,
    coordinates: equalEarthMetersExtentToDisplayCoordinates(extent),
  };
}

function worldBasemapOnMap(map: maplibregl.Map, kind: BasemapKind): boolean {
  return (
    appliedWorldKind === kind &&
    appliedWorldDisplayUrl != null &&
    Boolean(map.getLayer(FLAT_WORLD_LAYER_ID))
  );
}

async function ensureWorldBasemap(map: maplibregl.Map, kind: BasemapKind): Promise<void> {
  const coordinates = equalEarthWorldDisplayCoordinates();
  const exportUrl = equalEarthWorldExportUrl(kind);
  const displayUrl = await preloadBasemapImage(
    exportUrl,
    EQUAL_EARTH_WORLD_EXTENT,
    setBasemapLoaderProgress
  );
  const hadSource = Boolean(map.getSource(FLAT_WORLD_SOURCE_ID));
  const source = ensureImageRasterLayer(
    map,
    FLAT_WORLD_SOURCE_ID,
    FLAT_WORLD_LAYER_ID,
    displayUrl,
    coordinates
  );
  if (!source) return;
  if (hadSource) source.updateImage({ url: displayUrl, coordinates });
  appliedWorldKind = kind;
  appliedWorldDisplayUrl = displayUrl;
  stackFlatBasemapLayers(map);
  setLayerVisible(map, FLAT_WORLD_LAYER_ID, true);
}

export function prefetchEqualEarthBasemaps(_kind?: BasemapKind): void {
  for (const kind of ["map", "satellite"] as const) {
    void preloadBasemapImage(equalEarthWorldExportUrl(kind), EQUAL_EARTH_WORLD_EXTENT);
  }
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
    resetBasemapLoader();
  }
}

export async function refreshFlatBasemapImage(
  map: maplibregl.Map,
  kind: BasemapKind
): Promise<void> {
  const projection = getMapProjection();
  if (!isEqualEarthProjection(projection)) {
    resetBasemapLoader();
    return;
  }

  setGlobeRasterLayersHidden(map);

  const needsWorld = !worldBasemapOnMap(map, kind);
  const zoomedIn = !useWorldExtentBasemap(map);
  const request = zoomedIn ? resolveViewportBasemapRequest(map, kind) : null;
  const needsDetail =
    zoomedIn &&
    request != null &&
    !(request.key === appliedDetailKey && map.getLayer(FLAT_DETAIL_LAYER_ID));

  if (needsWorld) {
    beginBasemapWorldLoad();
    try {
      await ensureWorldBasemap(map, kind);
    } catch (error) {
      console.warn(error);
      return;
    } finally {
      endBasemapLayerLoad();
    }
  } else if (!zoomedIn) {
    setLayerVisible(map, FLAT_WORLD_LAYER_ID, true);
  }

  if (!zoomedIn) {
    showWorldBasemapOnly(map);
    appliedDetailKey = null;
    return;
  }

  if (!needsDetail) {
    showDetailBasemapOnly(map);
    return;
  }

  showWorldBasemapOnly(map);
  const loadZoom = map.getZoom();
  beginBasemapZoomLoad(loadZoom);
  const generation = ++refreshGeneration;
  try {
    const displayUrl = await preloadBasemapImage(
      request.url,
      request.extent,
      setBasemapLoaderProgress
    );
    if (generation !== refreshGeneration) return;
    if (getMapProjection() !== projection) return;
    if (useWorldExtentBasemap(map)) return;

    const hadSource = Boolean(map.getSource(FLAT_DETAIL_SOURCE_ID));
    const source = ensureImageRasterLayer(
      map,
      FLAT_DETAIL_SOURCE_ID,
      FLAT_DETAIL_LAYER_ID,
      displayUrl,
      request.coordinates
    );
    if (!source) return;
    if (hadSource) source.updateImage({ url: displayUrl, coordinates: request.coordinates });
    appliedDetailKey = request.key;
    showDetailBasemapOnly(map);
  } catch (error) {
    console.warn(error);
  } finally {
    endBasemapLayerLoad();
  }
}

function snapToWorldBasemapIfZoomedOut(map: maplibregl.Map, kind: BasemapKind): void {
  if (!isEqualEarthProjection(getMapProjection())) return;
  if (!useWorldExtentBasemap(map)) return;
  refreshGeneration += 1;
  appliedDetailKey = null;
  if (worldBasemapOnMap(map, kind)) {
    showWorldBasemapOnly(map);
  }
}

function scheduleFlatBasemapViewRefresh(map: maplibregl.Map, getKind: () => BasemapKind): void {
  if (!isEqualEarthProjection(getMapProjection())) return;
  if (viewRefreshTimer) clearTimeout(viewRefreshTimer);
  viewRefreshTimer = setTimeout(() => {
    viewRefreshTimer = null;
    void refreshFlatBasemapImage(map, getKind());
  }, VIEW_REFRESH_DEBOUNCE_MS);
}

export function bindFlatBasemapRefresh(map: maplibregl.Map, getKind: () => BasemapKind): void {
  map.on("resize", () => {
    if (!isEqualEarthProjection(getMapProjection())) return;
    appliedDetailKey = null;
    void refreshFlatBasemapImage(map, getKind());
  });
  map.on("moveend", () => {
    snapToWorldBasemapIfZoomedOut(map, getKind());
    scheduleFlatBasemapViewRefresh(map, getKind);
  });
  map.on("zoom", () => {
    if (!isEqualEarthProjection(getMapProjection())) return;
    if (useWorldExtentBasemap(map)) {
      snapToWorldBasemapIfZoomedOut(map, getKind());
      return;
    }
    scheduleFlatBasemapViewRefresh(map, getKind);
  });
  map.on("zoomend", () => {
    snapToWorldBasemapIfZoomedOut(map, getKind());
    scheduleFlatBasemapViewRefresh(map, getKind);
  });
}
