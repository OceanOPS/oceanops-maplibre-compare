import type { GeoJSONSourceSpecification } from "maplibre-gl";

/** Above this zoom, ship points stop clustering and draw individually. */
export const SHIP_CLUSTER_MAX_ZOOM = 10;

/** Screen pixels — ships closer than this on the tile merge into one cluster icon. */
export const SHIP_CLUSTER_RADIUS_PX = 42;

export function shipGeoJsonSourceOptions(
  data: GeoJSON.FeatureCollection
): GeoJSONSourceSpecification {
  return {
    type: "geojson",
    data,
    cluster: true,
    clusterMaxZoom: SHIP_CLUSTER_MAX_ZOOM,
    clusterRadius: SHIP_CLUSTER_RADIUS_PX,
  };
}

export function isShipClusterFeature(feature: GeoJSON.Feature): boolean {
  const props = feature.properties ?? {};
  if (props.cluster === true) return true;
  return typeof props.point_count === "number" && props.point_count > 0;
}

export function shipClusterLayerIds(categoryId: string): string[] {
  return [
    `${categoryId}-cluster-layer`,
    `${categoryId}-cluster-count-layer`,
    `${categoryId}-layer`,
  ];
}
