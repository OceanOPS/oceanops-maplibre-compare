import { categories } from "./categories";
import { stackLayerIdForQueries } from "./mooringStackLayer";

/** MapLibre layer ids used in queries and popups. */
export function interactiveLayerIds(): string[] {
  const ids: string[] = [];
  for (const cat of categories) {
    if (cat.type === "line") {
      ids.push(`${cat.id}-solid`, `${cat.id}-dash`);
    } else {
      ids.push(`${cat.id}-layer`);
    }
  }
  ids.push(stackLayerIdForQueries());
  return ids;
}

export function categoryIdFromMapLayer(layerId: string): string | undefined {
  if (layerId === "mooring_stacks-layer") return "mooring_stacks";
  const m = layerId.match(/^(.+)-(solid|dash|layer)$/);
  return m?.[1];
}
