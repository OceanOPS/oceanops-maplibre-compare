import type maplibregl from "maplibre-gl";
import { MOORING_STACK_LAYER_ID } from "./mooring/mooringStackConstants";
import {
  computeStackDisplayMask,
  loadMooringStackData,
  PNG_DISPLAY_SIZE,
  stackPngUrlForDisplayMask,
  type MooringStackData,
  type MooringStackVisibility,
} from "./mooring/mooringStackData";
import { MAP_SQUARE_MARKER_SIZE } from "./oceanops/categories";
import { categories } from "./categories";
import {
  filteredCollection,
  getLastCountryFilterState,
  registerLayerGeoJson,
} from "./geoJsonCountryFilter";
import { collectionForMapDisplay } from "./geoProjection";
import { ensurePointMarkerImages } from "./pointMarkerImages";
import {
  MARKER_CANVAS_PX,
  MARKER_PIXEL_RATIO,
  pointMarkerIconSize,
  SQUARE_MARKER_SIDE_PX,
} from "./mapSymbolSize";
import type { CountryFilterState } from "./geoJsonCountryFilter";

export { MOORING_STACK_LAYER_ID, loadMooringStackData, type MooringStackData };

const STACK_SOURCE = `${MOORING_STACK_LAYER_ID}-source`;
const STACK_LAYER = `${MOORING_STACK_LAYER_ID}-layer`;

let stackCollection: GeoJSON.FeatureCollection | null = null;

function mooringVisibilityFromMap(map: maplibregl.Map): MooringStackVisibility {
  const vis = (layerId: string) =>
    map.getLayer(`${layerId}-layer`)?.visibility !== "none";
  return {
    mooredBuoys: vis("moored_buoys"),
    oceansites: vis("oceansites"),
    soconetMoorings: vis("soconet_moorings"),
  };
}

function enrichedStackData(
  collection: GeoJSON.FeatureCollection,
  visibility: MooringStackVisibility
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features
      .map((f) => {
        const stackMask = Number((f.properties ?? {}).stack_mask ?? 0);
        const displayMask = computeStackDisplayMask(stackMask, visibility);
        if (displayMask === 0) return null;
        return {
          ...f,
          properties: {
            ...(f.properties ?? {}),
            stack_display_mask: displayMask,
          },
        };
      })
      .filter(Boolean) as GeoJSON.Feature[],
  };
}

/**
 * Stack PNGs are pre-composited offset circles (~12–16px). Esri draws them at
 * PNG_DISPLAY_SIZE px — scale into the same 28px canvas as solo squares (crisp NN upscale).
 */
async function addStackCompositeImage(
  map: maplibregl.Map,
  url: string,
  id: string,
  displayMask: number
): Promise<void> {
  const img = new Image();
  img.decoding = "async";
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Stack icon failed: ${url}`));
    img.src = url;
  });

  const displayPx =
    PNG_DISPLAY_SIZE[displayMask] ??
    MAP_SQUARE_MARKER_SIZE + 2 * 0.5;
  const targetArtPx =
    (displayPx / MAP_SQUARE_MARKER_SIZE) * SQUARE_MARKER_SIDE_PX;

  const canvas = document.createElement("canvas");
  canvas.width = MARKER_CANVAS_PX;
  canvas.height = MARKER_CANVAS_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, MARKER_CANVAS_PX, MARKER_CANVAS_PX);
  ctx.imageSmoothingEnabled = false;
  const scale = targetArtPx / Math.max(img.naturalWidth, img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(
    img,
    (MARKER_CANVAS_PX - dw) / 2,
    (MARKER_CANVAS_PX - dh) / 2,
    dw,
    dh
  );

  const { data, width, height } = ctx.getImageData(
    0,
    0,
    MARKER_CANVAS_PX,
    MARKER_CANVAS_PX
  );
  if (map.hasImage(id)) map.removeImage(id);
  map.addImage(id, { width, height, data }, { pixelRatio: MARKER_PIXEL_RATIO });
}

async function ensureStackImages(map: maplibregl.Map): Promise<void> {
  for (const mask of [3, 5, 6, 7]) {
    const url = stackPngUrlForDisplayMask(mask);
    const id = `mooring-stack-${mask}`;
    if (!url) continue;
    await addStackCompositeImage(map, url, id, mask);
  }
  await ensurePointMarkerImages(map, categories);
}

export function mooringSoloUrl(
  catId: string,
  data: MooringStackData
): string | undefined {
  if (catId === "moored_buoys") return data.mooredBuoysSolo;
  if (catId === "oceansites") return data.oceansitesSolo;
  if (catId === "soconet_moorings") return data.soconetMooringsSolo;
  return undefined;
}

export async function addMooringStackLayer(
  map: maplibregl.Map,
  stackGeoJsonUrl: string
): Promise<void> {
  const r = await fetch(stackGeoJsonUrl);
  stackCollection = (await r.json()) as GeoJSON.FeatureCollection;
  registerLayerGeoJson(MOORING_STACK_LAYER_ID, stackCollection);
  await ensureStackImages(map);
  const visibility = mooringVisibilityFromMap(map);
  const data = collectionForMapDisplay(
    enrichedStackData(stackCollection, visibility)
  );

  if (map.getSource(STACK_SOURCE)) {
    (map.getSource(STACK_SOURCE) as maplibregl.GeoJSONSource).setData(data);
  } else {
    map.addSource(STACK_SOURCE, { type: "geojson", data });
  }

  if (map.getLayer(STACK_LAYER)) return;

  map.addLayer({
    id: STACK_LAYER,
    type: "symbol",
    source: STACK_SOURCE,
    layout: {
      "icon-image": [
        "case",
        ["==", ["get", "stack_display_mask"], 1],
        "point-marker-moored_buoys",
        ["==", ["get", "stack_display_mask"], 2],
        "point-marker-oceansites",
        ["==", ["get", "stack_display_mask"], 4],
        "point-marker-soconet_moorings",
        [
          "concat",
          "mooring-stack-",
          ["to-string", ["get", "stack_display_mask"]],
        ],
      ],
      "icon-size": pointMarkerIconSize,
      "icon-pitch-alignment": "map",
      "icon-rotation-alignment": "map",
      "icon-anchor": "center",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
}

export function refreshMooringStackLayer(
  map: maplibregl.Map,
  countryState?: CountryFilterState
): void {
  if (!stackCollection || !map.getSource(STACK_SOURCE)) return;
  const visibility = mooringVisibilityFromMap(map);
  const state = countryState ?? getLastCountryFilterState();
  const base = state
    ? filteredCollection(MOORING_STACK_LAYER_ID, state)
    : stackCollection;
  const data = collectionForMapDisplay(enrichedStackData(base, visibility));
  (map.getSource(STACK_SOURCE) as maplibregl.GeoJSONSource).setData(data);

  const anyStackVisible =
    visibility.mooredBuoys || visibility.oceansites || visibility.soconetMoorings;
  map.setLayoutProperty(
    STACK_LAYER,
    "visibility",
    anyStackVisible ? "visible" : "none"
  );
}

export function stackLayerIdForQueries(): string {
  return STACK_LAYER;
}

