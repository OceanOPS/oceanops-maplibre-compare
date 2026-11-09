/** Stops globe auto-rotation (or similar) when the map is focused on a selection. */

let stopAutoMotion: (() => void) | null = null;

export function registerMapAutoMotionStop(fn: () => void): void {
  stopAutoMotion = fn;
}

export function stopMapAutoMotion(): void {
  stopAutoMotion?.();
}
