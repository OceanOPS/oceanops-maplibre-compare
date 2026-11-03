import type maplibregl from "maplibre-gl";
import { MAP_SQUARE_MARKER_SIZE, type Category } from "./categories";

function addSquareImage(map: maplibregl.Map, id: string, color: string, size: number): void {
  const px = 28;
  const pad = Math.max(2, Math.floor((px - size * 2) / 2));
  const data = new Uint8Array(px * px * 4);
  const side = size * 2;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const i = (y * px + x) * 4;
      const inside =
        x >= pad && x < pad + side && y >= pad && y < pad + side;
      const border =
        inside &&
        (x === pad ||
          y === pad ||
          x === pad + side - 1 ||
          y === pad + side - 1);
      const [r, g, b] = hexToRgb(color);
      if (border) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      } else if (inside) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
  }
  if (!map.hasImage(id)) {
    map.addImage(id, { width: px, height: px, data }, { pixelRatio: 2 });
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export async function ensurePointMarkerImages(
  map: maplibregl.Map,
  cats: readonly Category[]
): Promise<void> {
  for (const cat of cats) {
    if (cat.type !== "point" || cat.shape !== "square") continue;
    const id = `point-marker-${cat.id}`;
    if (map.hasImage(id)) continue;
    const size =
      "markerSize" in cat && cat.markerSize != null
        ? cat.markerSize
        : MAP_SQUARE_MARKER_SIZE;
    addSquareImage(map, id, cat.color, size);
  }
  for (const cat of cats) {
    if (cat.type !== "point" || cat.shape !== "triangle") continue;
    const id = `point-marker-${cat.id}`;
    if (map.hasImage(id)) continue;
    addTriangleImage(map, id, cat.color);
  }
}

function addTriangleImage(map: maplibregl.Map, id: string, color: string): void {
  const px = 28;
  const data = new Uint8Array(px * px * 4);
  const [r, g, b] = hexToRgb(color);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const i = (y * px + x) * 4;
      const nx = x / px;
      const ny = y / px;
      const inside = ny >= 0.15 && ny <= 0.85 && nx >= 0.5 - (ny - 0.15) * 0.45 && nx <= 0.5 + (ny - 0.15) * 0.45;
      if (inside) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
  }
  if (!map.hasImage(id)) {
    map.addImage(id, { width: px, height: px, data }, { pixelRatio: 2 });
  }
}

export function pointMarkerImageId(cat: Category): string | null {
  if (cat.type !== "point") return null;
  if (cat.shape === "square" || cat.shape === "triangle") {
    return `point-marker-${cat.id}`;
  }
  return null;
}
