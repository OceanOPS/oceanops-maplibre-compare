import type maplibregl from "maplibre-gl";

/** Raster-dem source used by `map.setTerrain` on the 3D globe. */
export const GLOBE_TERRAIN_DEM_SOURCE_ID = "globe-terrain-dem";

/** Globe camera tilt — 0 matches oceanops-simple-map SceneView. */
export const GLOBE_TERRAIN_PITCH_DEG = 0;

/**
 * Vertical scale on the terrain mesh. Ocean trenches need a high factor; JAXA land DEMs
 * flatten the seafloor — we use global Terrarium tiles (Mapzen ETOPO-style bathymetry).
 */
export const GLOBE_TERRAIN_EXAGGERATION = 9;

const GLOBE_TERRAIN_HILLSHADE_ID = "globe-terrain-hillshade";

/** Terrarium RGB DEM incl. seafloor (Mapzen elevation tiles on AWS). */
const TERRAIN_TILES = [
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
];

function clearStaleGlobeTerrainSource(map: maplibregl.Map): void {
  const src = map.getSource(GLOBE_TERRAIN_DEM_SOURCE_ID) as
    | { encoding?: string }
    | undefined;
  if (!src || src.encoding === "terrarium") return;
  disableGlobeTerrain(map);
  if (map.getLayer(GLOBE_TERRAIN_HILLSHADE_ID)) {
    map.removeLayer(GLOBE_TERRAIN_HILLSHADE_ID);
  }
  map.removeSource(GLOBE_TERRAIN_DEM_SOURCE_ID);
}

export function ensureGlobeTerrainSource(map: maplibregl.Map): void {
  clearStaleGlobeTerrainSource(map);
  if (map.getSource(GLOBE_TERRAIN_DEM_SOURCE_ID)) return;
  map.addSource(GLOBE_TERRAIN_DEM_SOURCE_ID, {
    type: "raster-dem",
    tiles: TERRAIN_TILES,
    tileSize: 256,
    maxzoom: 15,
    encoding: "terrarium",
    attribution: "Terrain © Mapzen, SRTM, NOAA",
  });
}

function ensureGlobeTerrainHillshade(map: maplibregl.Map): void {
  if (map.getLayer(GLOBE_TERRAIN_HILLSHADE_ID)) return;
  const before =
    map.getLayer("basemap-ocean")?.id ??
    map.getLayer("basemap-satellite")?.id ??
    undefined;
  map.addLayer(
    {
      id: GLOBE_TERRAIN_HILLSHADE_ID,
      type: "hillshade",
      source: GLOBE_TERRAIN_DEM_SOURCE_ID,
      paint: {
        "hillshade-exaggeration": 0.85,
        "hillshade-shadow-color": "#021018",
        "hillshade-highlight-color": "#9ec8e8",
        "hillshade-accent-color": "#1a4d6e",
        "hillshade-illumination-direction": 315,
      },
    },
    before
  );
}

export function enableGlobeTerrain(map: maplibregl.Map): void {
  ensureGlobeTerrainSource(map);
  ensureGlobeTerrainHillshade(map);
  map.setLayoutProperty(GLOBE_TERRAIN_HILLSHADE_ID, "visibility", "visible");
  map.setTerrain({
    source: GLOBE_TERRAIN_DEM_SOURCE_ID,
    exaggeration: GLOBE_TERRAIN_EXAGGERATION,
  });
}

export function disableGlobeTerrain(map: maplibregl.Map): void {
  if (typeof map.getTerrain === "function" && map.getTerrain()) {
    map.setTerrain(null);
  }
  if (map.getLayer(GLOBE_TERRAIN_HILLSHADE_ID)) {
    map.setLayoutProperty(GLOBE_TERRAIN_HILLSHADE_ID, "visibility", "none");
  }
}
