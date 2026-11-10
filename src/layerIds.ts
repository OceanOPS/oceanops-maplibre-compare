import { categories } from "./categories";
import { stackLayerIdForQueries } from "./mooringStackLayer";
import { shipClusterLayerIds } from "./shipCluster";

/** MapLibre layer ids used in queries and popups. */
export function interactiveLayerIds(): string[] {
  const ids: string[] = [];
  for (const cat of categories) {
    if (cat.type === "line") {
      ids.push(`${cat.id}-solid`, `${cat.id}-dash`);
    } else if (cat.type === "image") {
      ids.push(...shipClusterLayerIds(cat.id));
    } else {
      ids.push(`${cat.id}-layer`);
    }
  }
  ids.push(stackLayerIdForQueries());
  return ids;
}

export function categoryIdFromMapLayer(layerId: string): string | undefined {
  if (layerId === "mooring_stacks-layer") return "mooring_stacks";
  const m = layerId.match(/^(.+)-(solid|dash|cluster-count-layer|cluster-layer|layer)$/);
  return m?.[1];
}

export function dataLayerIdForCategory(categoryId: string): string {
  return `${categoryId}-layer`;
}
