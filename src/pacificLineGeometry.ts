import { PACIFIC_CENTRAL_MERIDIAN } from "./projections";

/** Keep longitudes in one 360° window around the Pacific center (same as simple-map). */
export function normalizeLongitudeForPacificView(
  lon: number,
  centralMeridian = PACIFIC_CENTRAL_MERIDIAN
): number {
  let x = lon;
  while (x - centralMeridian > 180) x -= 360;
  while (x - centralMeridian < -180) x += 360;
  return x;
}

/** Remove ±360° jumps between consecutive vertices (oceanops-data-exports densify). */
export function unwrapLongitudeContinuity(coords: GeoJSON.Position[]): GeoJSON.Position[] {
  if (coords.length < 2) return coords;
  const out: GeoJSON.Position[] = [[coords[0]![0], coords[0]![1], ...coords[0]!.slice(2)]];
  for (let i = 1; i < coords.length; i++) {
    let lon = normalizeLongitudeForPacificView(coords[i]![0] as number);
    const lat = coords[i]![1] as number;
    const prevLon = out[out.length - 1]![0] as number;
    const dlon = lon - prevLon;
    if (dlon > 180) lon -= 360;
    else if (dlon < -180) lon += 360;
    const pos: GeoJSON.Position = [lon, lat];
    if (coords[i]!.length > 2) pos.push(coords[i]![2] as number);
    out.push(pos);
  }
  return out;
}

/** Split when geographic longitude jumps > 180° (antimeridian). */
export function splitAtAntimeridian(coords: GeoJSON.Position[]): GeoJSON.Position[][] {
  if (coords.length < 2) return coords.length ? [coords] : [];
  const parts: GeoJSON.Position[][] = [[coords[0]!]];
  for (let i = 1; i < coords.length; i++) {
    const prev = parts[parts.length - 1]![parts[parts.length - 1]!.length - 1]!;
    const next = coords[i]!;
    const dlon = (next[0] as number) - (prev[0] as number);
    if (Math.abs(dlon) > 180) {
      parts.push([next]);
    } else {
      parts[parts.length - 1]!.push(next);
    }
  }
  return parts.filter((part) => part.length >= 2);
}

export function prepareLineVerticesForFlatProjection(
  line: GeoJSON.Position[]
): GeoJSON.Position[][] {
  if (line.length < 2) return line.length ? [line] : [];
  const normalized = line.map((c) => {
    const lon = normalizeLongitudeForPacificView(c[0] as number);
    const out: GeoJSON.Position = [lon, c[1] as number];
    if (c.length > 2) out.push(c[2] as number);
    return out;
  });
  return splitAtAntimeridian(unwrapLongitudeContinuity(normalized));
}

/** Split in warped display lng/lat when MapLibre would draw a spurious chord. */
export function splitLineInDisplaySpace(
  line: GeoJSON.Position[],
  maxDeltaLng = 95
): GeoJSON.Position[][] {
  if (line.length < 2) return line.length ? [line] : [];
  const parts: GeoJSON.Position[][] = [[line[0]!]];
  for (let i = 1; i < line.length; i++) {
    const prev = parts[parts.length - 1]![parts[parts.length - 1]!.length - 1]!;
    const next = line[i]!;
    const dLng = Math.abs((next[0] as number) - (prev[0] as number));
    if (dLng > maxDeltaLng) {
      parts.push([next]);
    } else {
      parts[parts.length - 1]!.push(next);
    }
  }
  return parts.filter((part) => part.length >= 2);
}

export function pacificBoundsForLine(path: GeoJSON.Position[]): {
  west: number;
  south: number;
  east: number;
  north: number;
} | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const coord of path) {
    const lon = normalizeLongitudeForPacificView(coord[0] as number);
    const lat = coord[1] as number;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    minX = Math.min(minX, lon);
    maxX = Math.max(maxX, lon);
    minY = Math.min(minY, lat);
    maxY = Math.max(maxY, lat);
  }
  if (!Number.isFinite(minX)) return null;
  return { west: minX, south: minY, east: maxX, north: maxY };
}
