import type maplibregl from "maplibre-gl";
import {
  categories,
  type Category,
  legendLayerIdsForCategory,
} from "./categories";
import { moveBasemapBelowData } from "./basemap";
import type { MooringStackData } from "./mooringStackLayer";
import { mooringSoloUrl, refreshMooringStackLayer } from "./mooringStackLayer";
import { registerLayerGeoJson } from "./geoJsonCountryFilter";
import { assetUrl, iconIdFromAssetPath } from "./assetUrl";
import {
  ensurePointMarkerImages,
  pointMarkerImageId,
} from "./pointMarkerImages";
import { pointMarkerIconSize, shipIconSize } from "./mapSymbolSize";

const LINE_LAYER_IDS = new Set(["goship", "oceantrax"]);

export type MapProjectionMode = "globe" | "mercator";

function lineGeoJsonUrl(id: string, projection: MapProjectionMode): string {
  if (LINE_LAYER_IDS.has(id) && projection === "mercator") {
    return `/geojson/${id}_undensified.geojson`;
  }
  if (LINE_LAYER_IDS.has(id)) {
    return `/geojson/${id}.geojson`;
  }
  return `/geojson/${id}.geojson`;
}

function pointRadius(cat: Category): number {
  if (cat.type !== "point") return 4;
  if (cat.shape === "square") return 4.5;
  if (cat.shape === "triangle") return 5;
  return 3.5;
}

async function fetchGeoJson(url: string): Promise<GeoJSON.FeatureCollection> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json() as Promise<GeoJSON.FeatureCollection>;
}

function solidLineFilter(): maplibregl.FilterSpecification {
  return [
    "any",
    ["==", ["get", "line_style"], "solid"],
    ["==", ["get", "line_style"], ""],
  ];
}

/** MapLibre needs RGBA; indexed PNG ship sprites are decoded via canvas (Esri accepts both). */
async function addShipSprite(map: maplibregl.Map, path: string): Promise<void> {
  const id = iconIdFromAssetPath(path);
  if (map.hasImage(id)) return;

  const url = assetUrl(path);
  const img = new Image();
  img.decoding = "async";
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Ship icon failed: ${url}`));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (!map.hasImage(id)) {
    map.addImage(id, { width, height, data }, { pixelRatio: 2 });
  }
}

export async function loadShipIcons(map: maplibregl.Map): Promise<void> {
  const paths = new Set<string>();
  for (const cat of categories) {
    if (cat.type === "image") paths.add(cat.imagePath);
  }
  for (const path of paths) {
    await addShipSprite(map, path);
  }
}

function layerIdsForCategory(cat: Category): string[] {
  if (cat.type === "line") {
    return [`${cat.id}-solid`, `${cat.id}-dash`];
  }
  return [`${cat.id}-layer`];
}

export function setCategoryVisible(
  map: maplibregl.Map,
  cat: Category,
  visible: boolean
): void {
  const v = visible ? "visible" : "none";
  for (const layerId of layerIdsForCategory(cat)) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", v);
  }
  if (cat.type === "image" && "legendCompanionId" in cat && cat.legendCompanionId) {
    const companion = categories.find((c) => c.id === cat.legendCompanionId);
    if (companion) setCategoryVisible(map, companion, visible);
  }
  if (
    cat.id === "moored_buoys" ||
    cat.id === "oceansites" ||
    cat.id === "soconet_moorings"
  ) {
    refreshMooringStackLayer(map);
  }
}

let firstDataLayerId: string | null = null;

function rememberFirstDataLayer(id: string) {
  if (!firstDataLayerId) firstDataLayerId = id;
}

export async function addCategoryLayer(
  map: maplibregl.Map,
  cat: Category,
  projection: MapProjectionMode,
  mooringData?: MooringStackData
): Promise<void> {
  const sourceId = `${cat.id}-source`;
  const solo = mooringData ? mooringSoloUrl(cat.id, mooringData) : undefined;
  const url =
    solo ??
    (cat.type === "line"
      ? lineGeoJsonUrl(cat.id, projection)
      : `/geojson/${cat.id}.geojson`);

  const data = solo ? await fetchGeoJson(solo) : await fetchGeoJson(url);
  registerLayerGeoJson(
    cat.id,
    JSON.parse(JSON.stringify(data)) as GeoJSON.FeatureCollection
  );
  if (map.getSource(sourceId)) {
    (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(data);
  } else {
    map.addSource(sourceId, { type: "geojson", data });
  }

  if (cat.type === "line") {
    const solidId = `${cat.id}-solid`;
    const dashId = `${cat.id}-dash`;
    if (!map.getLayer(solidId)) {
      map.addLayer({
        id: solidId,
        type: "line",
        source: sourceId,
        filter: solidLineFilter(),
        paint: {
          "line-color": cat.color,
          "line-width": 2.5,
          "line-opacity": 0.95,
        },
        layout: { "line-join": "round", "line-cap": "round" },
      });
      rememberFirstDataLayer(solidId);
    }
    if (!map.getLayer(dashId)) {
      map.addLayer({
        id: dashId,
        type: "line",
        source: sourceId,
        filter: ["==", ["get", "line_style"], "dash"],
        paint: {
          "line-color": cat.color,
          "line-width": 2,
          "line-opacity": 0.9,
          "line-dasharray": [2, 1.5],
        },
        layout: { "line-join": "round", "line-cap": "round" },
      });
    }
    return;
  }

  const layerId = `${cat.id}-layer`;
  if (map.getLayer(layerId)) return;

  if (cat.type === "image") {
    const iconId = iconIdFromAssetPath(cat.imagePath);
    map.addLayer({
      id: layerId,
      type: "symbol",
      source: sourceId,
      layout: {
        "icon-image": iconId,
        "icon-size": shipIconSize,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
    rememberFirstDataLayer(layerId);
    return;
  }

  const markerId = pointMarkerImageId(cat);
  if (markerId && map.hasImage(markerId)) {
    map.addLayer({
      id: layerId,
      type: "symbol",
      source: sourceId,
      layout: {
        "icon-image": markerId,
        "icon-size": pointMarkerIconSize,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  } else {
    map.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": pointRadius(cat),
        "circle-color": cat.color,
        "circle-opacity": cat.id === "anibos" ? 0.85 : 0.75,
        "circle-stroke-width": 0.6,
        "circle-stroke-color": "#111",
      },
    });
  }
  rememberFirstDataLayer(layerId);
}

export async function loadAllCategories(
  map: maplibregl.Map,
  projection: MapProjectionMode,
  mooringData?: MooringStackData
): Promise<void> {
  await loadShipIcons(map);
  await ensurePointMarkerImages(map, categories);
  for (const cat of categories) {
    await addCategoryLayer(map, cat, projection, mooringData);
  }
  if (firstDataLayerId) moveBasemapBelowData(map, firstDataLayerId);
}

export async function reloadLineLayers(
  map: maplibregl.Map,
  projection: MapProjectionMode
): Promise<void> {
  for (const cat of categories) {
    if (cat.type !== "line") continue;
    await addCategoryLayer(map, cat, projection);
  }
}

export function layerIdsToggledByLegend(cat: Category): string[] {
  return legendLayerIdsForCategory(cat).flatMap((id) => {
    const c = categories.find((x) => x.id === id);
    if (!c) return [];
    return layerIdsForCategory(c);
  });
}
