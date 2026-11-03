import proj4 from "proj4";
import {
  PACIFIC_CENTRAL_MERIDIAN,
  PROJECTION_3D_GLOBE,
  PROJECTION_EQUAL_EARTH,
  PROJECTION_PLATE_CARREE_PACIFIC,
  type ProjectionId,
} from "./projections";

const WGS84 = "EPSG:4326";
const WEB_MERCATOR = "EPSG:3857";

/** Equal Earth on Web Mercator grid (maplibre-gl-equal-earth). */
proj4.defs(
  "OCEANOPS_EQ",
  `+proj=eqearth +lon_0=${PACIFIC_CENTRAL_MERIDIAN} +x_0=0 +y_0=0 +R=6371008.7714 +units=m +no_defs`
);

/** Pacific-centred plate carrée (equirectangular). */
proj4.defs(
  "OCEANOPS_EQC",
  `+proj=eqc +lat_ts=0 +lon_0=${PACIFIC_CENTRAL_MERIDIAN} +datum=WGS84 +units=m +no_defs`
);

const MERC_HALF = 20037508.342789244;
const EQ_HALF_X = 17243959.06;
const EQ_GRID_FACT = MERC_HALF / EQ_HALF_X;

const EQC_HALF_X = Math.PI * 6378137.0;
const EQC_HALF_Y = (Math.PI / 2) * 6378137.0;

function mercatorPlaneToDisplayLngLat(x: number, y: number): [number, number] {
  return proj4(WEB_MERCATOR, WGS84, [x, y]) as [number, number];
}

function displayLngLatToMercatorPlane(lng: number, lat: number): [number, number] {
  return proj4(WGS84, WEB_MERCATOR, [lng, lat]) as [number, number];
}

function wgs84ToEqualEarthMeters(lon: number, lat: number): [number, number] {
  return proj4(WGS84, "OCEANOPS_EQ", [lon, lat]) as [number, number];
}

function wgs84ToPlateCarreeMeters(lon: number, lat: number): [number, number] {
  return proj4(WGS84, "OCEANOPS_EQC", [lon, lat]) as [number, number];
}

/** Geographic WGS84 → MapLibre lng/lat used while `setProjection(mercator)` on flat modes. */
export function wgs84ToDisplayLngLat(
  lon: number,
  lat: number,
  projection: ProjectionId
): [number, number] {
  if (projection === PROJECTION_3D_GLOBE) return [lon, lat];

  if (projection === PROJECTION_EQUAL_EARTH) {
    const eq = wgs84ToEqualEarthMeters(lon, lat);
    const scaled = [eq[0] * EQ_GRID_FACT, eq[1] * EQ_GRID_FACT];
    return mercatorPlaneToDisplayLngLat(scaled[0], scaled[1]);
  }

  const eqc = wgs84ToPlateCarreeMeters(lon, lat);
  const scaled = [
    (eqc[0] / EQC_HALF_X) * MERC_HALF,
    (eqc[1] / EQC_HALF_Y) * MERC_HALF,
  ];
  return mercatorPlaneToDisplayLngLat(scaled[0], scaled[1]);
}

/** Inverse of {@link wgs84ToDisplayLngLat} for basemap export bounds. */
export function displayLngLatToWgs84(
  lng: number,
  lat: number,
  projection: ProjectionId
): [number, number] {
  if (projection === PROJECTION_3D_GLOBE) return [lng, lat];

  const [mx, my] = displayLngLatToMercatorPlane(lng, lat);

  if (projection === PROJECTION_EQUAL_EARTH) {
    const eq = [mx / EQ_GRID_FACT, my / EQ_GRID_FACT];
    return proj4("OCEANOPS_EQ", WGS84, eq) as [number, number];
  }

  const eqc = [(mx / MERC_HALF) * EQC_HALF_X, (my / MERC_HALF) * EQC_HALF_Y];
  return proj4("OCEANOPS_EQC", WGS84, eqc) as [number, number];
}

function transformCoords(
  coords: GeoJSON.Position,
  projection: ProjectionId,
  forward: boolean
): GeoJSON.Position {
  const fn = forward ? wgs84ToDisplayLngLat : displayLngLatToWgs84;
  if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    const [lng, lat] = fn(coords[0], coords[1], projection);
    const out: GeoJSON.Position = [lng, lat];
    if (coords.length > 2) out.push(coords[2] as number);
    return out;
  }
  return coords;
}

function transformGeometry(
  geometry: GeoJSON.Geometry,
  projection: ProjectionId,
  forward: boolean
): GeoJSON.Geometry {
  if (projection === PROJECTION_3D_GLOBE) return geometry;

  switch (geometry.type) {
    case "Point":
      return {
        type: "Point",
        coordinates: transformCoords(geometry.coordinates, projection, forward),
      };
    case "MultiPoint":
      return {
        type: "MultiPoint",
        coordinates: geometry.coordinates.map((c) => transformCoords(c, projection, forward)),
      };
    case "LineString":
      return {
        type: "LineString",
        coordinates: geometry.coordinates.map((c) => transformCoords(c, projection, forward)),
      };
    case "MultiLineString":
      return {
        type: "MultiLineString",
        coordinates: geometry.coordinates.map((line) =>
          line.map((c) => transformCoords(c, projection, forward))
        ),
      };
    case "Polygon":
      return {
        type: "Polygon",
        coordinates: geometry.coordinates.map((ring) =>
          ring.map((c) => transformCoords(c, projection, forward))
        ),
      };
    case "MultiPolygon":
      return {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((poly) =>
          poly.map((ring) => ring.map((c) => transformCoords(c, projection, forward)))
        ),
      };
    case "GeometryCollection":
      return {
        type: "GeometryCollection",
        geometries: geometry.geometries.map((g) => transformGeometry(g, projection, forward)),
      };
    default:
      return geometry;
  }
}

export function transformFeatureCollectionForDisplay(
  collection: GeoJSON.FeatureCollection,
  projection: ProjectionId
): GeoJSON.FeatureCollection {
  if (projection === PROJECTION_3D_GLOBE) return collection;
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => ({
      ...feature,
      geometry: feature.geometry
        ? transformGeometry(feature.geometry, projection, true)
        : feature.geometry,
    })),
  };
}

/** WGS84 world corners for initial flat framing (Pacific-centred plate carrée / Equal Earth). */
export function wgs84WorldSampleGrid(): [number, number][] {
  const lons: number[] = [];
  for (let lon = -180; lon <= 180; lon += 30) lons.push(lon);
  const lats = [-85, -60, -30, 0, 30, 60, 85];
  const out: [number, number][] = [];
  for (const lat of lats) {
    for (const lon of lons) out.push([lon, lat]);
  }
  return out;
}

export function displayBoundsForWorld(projection: ProjectionId): [[number, number], [number, number]] {
  const points = wgs84WorldSampleGrid().map(([lon, lat]) =>
    wgs84ToDisplayLngLat(lon, lat, projection)
  );
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/** Equal Earth MapServer spatial reference (Pacific 150°W), aligned with simple-map. */
export const EQUAL_EARTH_MAPSERVER_WKT = `PROJCS["Equal Earth (world)_2",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Equal_Earth"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",${PACIFIC_CENTRAL_MERIDIAN}],UNIT["Meter",1.0]]`;

export function wgs84BboxToEqualEarthMeters(
  west: number,
  south: number,
  east: number,
  north: number
): { xmin: number; ymin: number; xmax: number; ymax: number } {
  const corners: [number, number][] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
  let xmin = Infinity;
  let ymin = Infinity;
  let xmax = -Infinity;
  let ymax = -Infinity;
  for (const [lon, lat] of corners) {
    const [x, y] = proj4(WGS84, "OCEANOPS_EQ", [lon, lat]) as [number, number];
    xmin = Math.min(xmin, x);
    ymin = Math.min(ymin, y);
    xmax = Math.max(xmax, x);
    ymax = Math.max(ymax, y);
  }
  return { xmin, ymin, xmax, ymax };
}
