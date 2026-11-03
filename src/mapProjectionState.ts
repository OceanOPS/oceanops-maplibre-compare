import { PROJECTION_3D_GLOBE, type ProjectionId } from "./projections";

let currentProjection: ProjectionId = PROJECTION_3D_GLOBE;

export function getMapProjection(): ProjectionId {
  return currentProjection;
}

export function setMapProjection(projection: ProjectionId): void {
  currentProjection = projection;
}
