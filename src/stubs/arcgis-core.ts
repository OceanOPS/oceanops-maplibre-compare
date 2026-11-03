/** Vite stub so MapLibre compare can import simple-map popup HTML without Esri bundles. */

export class PopupTemplate {
  constructor(_opts?: unknown) {}
}

export class Graphic {
  attributes: Record<string, unknown> = {};
  layer?: unknown;
  constructor(_opts?: { attributes?: Record<string, unknown> }) {
    if (_opts?.attributes) this.attributes = _opts.attributes;
  }
}

export default class CustomContent {
  container?: HTMLElement;
  constructor(_opts?: unknown) {}
}

export class MapView {
  constructor(_opts?: unknown) {}
}

export class SceneView {
  constructor(_opts?: unknown) {}
}
