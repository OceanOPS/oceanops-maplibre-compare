import type { BasemapKind } from "./basemap";

export function mountBasemapControl(
  onChange: (kind: BasemapKind) => void,
  initial: BasemapKind = "map"
): HTMLDivElement {
  let kind = initial;
  const menu = document.createElement("div");
  menu.className = "o-map-display-menu";

  const section = document.createElement("div");
  section.className = "o-map-display-section o-map-display-section--basemap";

  const mapBtn = document.createElement("button");
  mapBtn.type = "button";
  mapBtn.className = "o-basemap-preview-btn";
  mapBtn.title = "Ocean basemap";
  mapBtn.innerHTML = `<div class="o-basemap-preview o-basemap-preview--map" style="background-image:url('/img/map.jpeg')"></div>`;

  const satBtn = document.createElement("button");
  satBtn.type = "button";
  satBtn.className = "o-basemap-preview-btn";
  satBtn.title = "Satellite basemap";
  satBtn.innerHTML = `<div class="o-basemap-preview" style="background-image:url('/img/satelite.jpeg')"></div>`;

  const mapLabel = document.createElement("span");
  mapLabel.className = "o-basemap-kind-label";
  mapLabel.textContent = "Map layer";

  const satLabel = document.createElement("span");
  satLabel.className = "o-basemap-kind-label";
  satLabel.textContent = "Satellite layer";

  const syncActive = () => {
    mapBtn.classList.toggle("is-active", kind === "map");
    satBtn.classList.toggle("is-active", kind === "satellite");
  };

  mapBtn.addEventListener("click", () => {
    kind = "map";
    syncActive();
    onChange("map");
  });
  satBtn.addEventListener("click", () => {
    kind = "satellite";
    syncActive();
    onChange("satellite");
  });

  section.append(mapBtn, mapLabel, satBtn, satLabel);
  menu.appendChild(section);
  syncActive();
  return menu;
}
