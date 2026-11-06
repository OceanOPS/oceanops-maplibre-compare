import proj4 from "proj4";
import { getMapProjection } from "./mapProjectionState";
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

/** Full Equal Earth world extent (ArcGIS tile services / simple-map). */
export const EQUAL_EARTH_WORLD_HALF_X = 1.724_395_856_221_439e7;
export const EQUAL_EARTH_WORLD_HALF_Y = 8_392_927.098_466_456;

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

export function equalEarthMetersToDisplayLngLat(x: number, y: number): [number, number] {
  return mercatorPlaneToDisplayLngLat(x * EQ_GRID_FACT, y * EQ_GRID_FACT);
}

/** NW, NE, SE, SW of the Equal Earth world rectangle in MapLibre display lng/lat. */
export function equalEarthWorldDisplayCoordinates(): [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
] {
  const hx = EQUAL_EARTH_WORLD_HALF_X;
  const hy = EQUAL_EARTH_WORLD_HALF_Y;
  return [
    equalEarthMetersToDisplayLngLat(-hx, hy),
    equalEarthMetersToDisplayLngLat(hx, hy),
    equalEarthMetersToDisplayLngLat(hx, -hy),
    equalEarthMetersToDisplayLngLat(-hx, -hy),
  ];
}

export function equalEarthWorldDisplayBounds(): [[number, number], [number, number]] {
  const [nw, ne, se, sw] = equalEarthWorldDisplayCoordinates();
  return [
    [Math.min(nw[0], sw[0]), Math.min(sw[1], se[1])],
    [Math.max(ne[0], se[0]), Math.max(nw[1], ne[1])],
  ];
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

/** Warp GeoJSON into the current MapLibre display space (Equal Earth / Plate Carrée). */
export function collectionForMapDisplay(
  collection: GeoJSON.FeatureCollection
): GeoJSON.FeatureCollection {
  return transformFeatureCollectionForDisplay(collection, getMapProjection());
}

/**
 * Sample WGS84 for {@link displayBoundsForWorld} — must include ±90° so the
 * Mercator display bbox spans the full projected world (plate carrée / Equal Earth).
 * Omitting the poles underestimated height and made the initial fit too zoomed-in.
 */
export function wgs84WorldSampleGrid(): [number, number][] {
  const lons: number[] = [];
  for (let lon = -180; lon <= 180; lon += 30) lons.push(lon);
  const lats = [-90, -85, -60, -30, 0, 30, 60, 85, 90];
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

export const OCEANOPS_NAVY_RGB = [0x0b, 0x1e, 0x42] as const;

export type EqualEarthMeterExtent = {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
};

/** Fill pixels outside the Equal Earth oval with OceanOPS navy (#0b1e42). */
export function paintNavyOutsideEqualEarth(
  imageData: ImageData,
  extent: EqualEarthMeterExtent
): void {
  const { width: w, height: h, data } = imageData;
  const xSpan = extent.xmax - extent.xmin;
  const ySpan = extent.ymax - extent.ymin;
  if (w < 1 || h < 1 || xSpan <= 0 || ySpan <= 0) return;

  const [nR, nG, nB] = OCEANOPS_NAVY_RGB;
  const slack = xSpan / w;

  for (let j = 0; j < h; j++) {
    const y = extent.ymax - ((j + 0.5) / h) * ySpan;
    const lat = (proj4("OCEANOPS_EQ", WGS84, [0, y]) as [number, number])[1];
    const row = j * w * 4;
    if (!Number.isFinite(lat) || Math.abs(lat) > 90.05) {
      for (let i = 0; i < w; i++) {
        const p = row + i * 4;
        data[p] = nR;
        data[p + 1] = nG;
        data[p + 2] = nB;
        data[p + 3] = 255;
      }
      continue;
    }
    const edgeX = (
      proj4(WGS84, "OCEANOPS_EQ", [PACIFIC_CENTRAL_MERIDIAN + 179.99, lat]) as [
        number,
        number,
      ]
    )[0];
    const xLimit = Math.abs(edgeX) + slack;
    for (let i = 0; i < w; i++) {
      const x = extent.xmin + ((i + 0.5) / w) * xSpan;
      if (Math.abs(x) <= xLimit) continue;
      const p = row + i * 4;
      data[p] = nR;
      data[p + 1] = nG;
      data[p + 2] = nB;
      data[p + 3] = 255;
    }
  }
}
