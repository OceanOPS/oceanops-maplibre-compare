import type { ExpressionSpecification } from "maplibre-gl";

/** Canvas for generated square/triangle markers (`pointMarkerImages.ts`). */
export const MARKER_CANVAS_PX = 28;
export const MARKER_PIXEL_RATIO = 2;

/**
 * MapLibre icon-size so drawn content (~contentPx wide in the sprite) appears
 * ~targetScreenPx on screen: display ≈ contentPx × icon-size / pixelRatio.
 */
export function iconSizeForContentPx(
  contentPx: number,
  targetScreenPx: number
): number {
  return (targetScreenPx * MARKER_PIXEL_RATIO) / contentPx;
}

/** Square side in sprite = 2 × MAP_SQUARE_MARKER_SIZE (10px) — match ~9px circles at world zoom. */
export const SQUARE_MARKER_SIDE_PX = 10;
const squareWorld = iconSizeForContentPx(SQUARE_MARKER_SIDE_PX, 9);

/** GLOSS / moorings / HF radar squares and stack solo masks. */
export const pointMarkerIconSize: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  0,
  squareWorld,
  4,
  squareWorld * 1.08,
  10,
  squareWorld * 1.18,
];

/** Stack composite PNGs (slightly larger than solo squares). */
export const mooringStackIconSize: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  0,
  squareWorld * 1.12,
  4,
  squareWorld * 1.2,
  10,
  squareWorld * 1.32,
];

/** Ship sprites (~21px tall); target ~11px like Esri globe IconSymbol3DLayer. */
const shipWorld = iconSizeForContentPx(21, 11);

export const shipIconSize: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  0,
  shipWorld,
  4,
  shipWorld * 1.1,
  10,
  shipWorld * 1.22,
];
