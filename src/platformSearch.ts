import type maplibregl from "maplibre-gl";
import { categories, getLayerDisplayLabel } from "./categories";
import { getRawLayerGeoJson } from "./geoJsonCountryFilter";
import { wgs84ToDisplayLngLat } from "./geoProjection";
import type { MapProjectionMode } from "./layers";
import { getMapProjection } from "./mapProjectionState";
import { openFeaturePopup } from "./mapInteractions";
import {
  MOORING_STACK_BITS,
  MOORING_STACK_LAYER_ID,
  stackNetworkLabels,
  type MooringStackLayerId,
} from "./mooring/mooringStackConstants";
import { appendToolbarHint, SEARCH_TOGGLE_HINT } from "./oceanops/mapToolbar";

type SearchHit = {
  label: string;
  wmo: string;
  network: string;
  layerId: string;
  isLine: boolean;
  stackMask: number;
  featureIndex: number;
};

const MAX_SUGGESTIONS = 8;
const MIN_QUERY_LENGTH = 1;

const LINE_LAYER_IDS = new Set<string>(
  categories.filter((cat) => cat.type === "line").map((cat) => cat.id)
);

export type PlatformSearchController = {
  rebuild: () => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  setOpenChangeListener: (listener: (() => void) | null) => void;
};

export function createPlatformSearchBar(options: {
  getSearch: () => PlatformSearchController | null;
}): {
  searchBar: HTMLDivElement;
  syncSearchButton: () => void;
} {
  document.getElementById("platform-search-bar")?.remove();

  const searchButton = document.createElement("button");
  searchButton.id = "platform-search-toggle";
  searchButton.type = "button";
  searchButton.className = "o-platform-search-toggle";
  searchButton.setAttribute("aria-label", SEARCH_TOGGLE_HINT);
  searchButton.setAttribute("aria-expanded", "false");
  searchButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="#f8f8f8" stroke-width="2"/>
      <path d="M16.5 16.5L21 21" stroke="#f8f8f8" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  appendToolbarHint(searchButton, SEARCH_TOGGLE_HINT);

  const searchAnchor = document.createElement("div");
  searchAnchor.id = "platform-search-anchor";
  searchAnchor.className = "o-platform-search-anchor";

  const searchBar = document.createElement("div");
  searchBar.id = "platform-search-bar";
  searchBar.className = "o-platform-search-bar";
  searchBar.append(searchButton, searchAnchor);

  const syncSearchButton = () => {
    const search = options.getSearch();
    const open = search?.isOpen() ?? false;
    searchButton.classList.toggle("is-active", open);
    searchButton.setAttribute("aria-expanded", String(open));
  };

  searchButton.addEventListener("click", () => {
    const search = options.getSearch();
    if (!search) return;
    search.toggle();
    syncSearchButton();
  });

  return { searchBar, syncSearchButton };
}

export function mountPlatformSearch(options: {
  shell: HTMLElement;
  map: maplibregl.Map;
  stopRotation: () => void;
  getProjection: () => MapProjectionMode;
}): PlatformSearchController {
  document.getElementById("platform-search")?.remove();

  const root = document.createElement("div");
  root.id = "platform-search";
  root.className = "o-platform-search";
  let panelOpen = false;
  let onOpenChange: (() => void) | null = null;

  const input = document.createElement("input");
  input.type = "search";
  input.className = "o-platform-search-input";
  input.placeholder = "Enter reference number or line name";
  input.setAttribute("aria-label", "Enter reference number or line name");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", "platform-search-list");
  input.autocomplete = "off";
  input.spellcheck = false;

  const list = document.createElement("ul");
  list.id = "platform-search-list";
  list.className = "o-platform-search-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;

  const status = document.createElement("p");
  status.className = "o-platform-search-status";
  status.hidden = true;

  root.append(input, list, status);
  options.shell.appendChild(root);

  let hits: SearchHit[] = [];
  let activeIndex = -1;
  let shown: SearchHit[] = [];

  const setStatus = (text: string) => {
    status.hidden = !text;
    status.textContent = text;
  };

  const closeList = () => {
    list.hidden = true;
    list.replaceChildren();
    input.setAttribute("aria-expanded", "false");
    activeIndex = -1;
    shown = [];
  };

  const setPanelOpen = (open: boolean) => {
    panelOpen = open;
    root.classList.toggle("is-open", open);
    if (!open) {
      closeList();
      input.blur();
      setStatus("");
    }
    onOpenChange?.();
  };

  const syncActiveOption = () => {
    const optionNodes = list.querySelectorAll(".o-platform-search-option");
    optionNodes.forEach((node, index) => {
      node.classList.toggle("is-active", index === activeIndex);
    });
    if (activeIndex >= 0) {
      input.setAttribute(
        "aria-activedescendant",
        `platform-search-option-${activeIndex}`
      );
      optionNodes[activeIndex]?.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  };

  const renderList = (matches: SearchHit[]) => {
    shown = matches;
    activeIndex = matches.length > 0 ? 0 : -1;
    list.replaceChildren();
    if (matches.length === 0) {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      return;
    }

    matches.forEach((hit, index) => {
      const item = document.createElement("li");
      item.className = "o-platform-search-option";
      item.setAttribute("role", "option");
      item.id = `platform-search-option-${index}`;
      if (index === activeIndex) item.classList.add("is-active");

      const label = document.createElement("span");
      label.className = "o-platform-search-option-label";
      label.textContent = hit.label;

      const meta = document.createElement("span");
      meta.className = "o-platform-search-option-meta";
      meta.textContent =
        hit.wmo && hit.wmo !== hit.label
          ? `${hit.network} · WMO ${hit.wmo}`
          : hit.network;

      item.append(label, meta);
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        void selectHit(hit);
      });
      list.appendChild(item);
    });

    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    syncActiveOption();
  };

  const refreshSuggestions = () => {
    const query = input.value.trim().toLowerCase();
    if (query.length < MIN_QUERY_LENGTH) {
      closeList();
      setStatus("");
      return;
    }
    if (hits.length === 0) {
      closeList();
      setStatus("No platforms indexed yet.");
      return;
    }
    setStatus("");
    renderList(matchHits(hits, query));
    if (shown.length === 0) setStatus("No match.");
  };

  const selectHit = async (hit: SearchHit) => {
    closeList();
    setStatus("Going to platform…");
    options.stopRotation();
    revealNetworks(hit);

    const feature = featureForHit(hit);
    const geometry = feature?.geometry ?? null;
    const target = toDisplayNavTarget(navigationTarget(geometry, hit.isLine));
    if (!feature || !target) {
      setStatus("Could not locate that platform.");
      return;
    }

    try {
      await flyToTarget(options.map, target, hit.isLine, options.getProjection());
      await openFeaturePopup(
        options.map,
        feature,
        mapLayerIdForHit(hit),
        target.popup,
        { focusOnOpen: false }
      );
      input.value = "";
      setPanelOpen(false);
    } catch (error) {
      console.warn("Platform search failed", error);
      setStatus("Could not locate that platform.");
    }
  };

  input.addEventListener("input", refreshSuggestions);
  input.addEventListener("focus", refreshSuggestions);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!list.hidden) {
        closeList();
        setStatus("");
        return;
      }
      setPanelOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      if (shown.length === 0) return;
      event.preventDefault();
      activeIndex = (activeIndex + 1) % shown.length;
      syncActiveOption();
      return;
    }
    if (event.key === "ArrowUp") {
      if (shown.length === 0) return;
      event.preventDefault();
      activeIndex = (activeIndex - 1 + shown.length) % shown.length;
      syncActiveOption();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const hit = shown[activeIndex] ?? shown[0];
      if (hit) void selectHit(hit);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target as Node;
    if (root.contains(target)) return;
    if (document.getElementById("platform-search-toggle")?.contains(target)) return;
    closeList();
    if (panelOpen && !root.contains(target)) setPanelOpen(false);
  });

  const rebuild = () => {
    hits = buildSearchIndex();
    root.dataset.indexCount = String(hits.length);
    if (document.activeElement === input) refreshSuggestions();
  };

  rebuild();

  return {
    rebuild,
    open: () => {
      setPanelOpen(true);
      input.focus();
    },
    close: () => setPanelOpen(false),
    toggle: () => {
      if (panelOpen) setPanelOpen(false);
      else {
        setPanelOpen(true);
        input.focus();
      }
    },
    isOpen: () => panelOpen,
    setOpenChangeListener: (listener) => {
      onOpenChange = listener;
    },
  };
}

function matchHits(hits: SearchHit[], query: string): SearchHit[] {
  const ranked: { hit: SearchHit; rank: number }[] = [];
  for (const hit of hits) {
    const rank = matchRank(hit, query);
    if (rank == null) continue;
    ranked.push({ hit, rank });
  }
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.hit.label.length - b.hit.label.length ||
      a.hit.label.localeCompare(b.hit.label) ||
      a.hit.network.localeCompare(b.hit.network)
  );
  return ranked.slice(0, MAX_SUGGESTIONS).map((entry) => entry.hit);
}

function matchRank(hit: SearchHit, query: string): number | null {
  const label = hit.label.toLowerCase();
  const wmo = hit.wmo.toLowerCase();
  if (label.startsWith(query)) return 0;
  if (wmo && wmo.startsWith(query)) return 1;
  if (label.includes(query)) return 2;
  if (wmo && wmo.includes(query)) return 3;
  return null;
}

function buildSearchIndex(): SearchHit[] {
  const hits: SearchHit[] = [];

  for (const cat of categories) {
    indexCollection(
      cat.id,
      getLayerDisplayLabel(cat.id),
      LINE_LAYER_IDS.has(cat.id),
      hits
    );
  }
  indexCollection(MOORING_STACK_LAYER_ID, "", false, hits);
  return hits;
}

function indexCollection(
  layerId: string,
  network: string,
  isLine: boolean,
  hits: SearchHit[]
): void {
  const collection = getRawLayerGeoJson(layerId);
  if (!collection) return;

  collection.features.forEach((feature, featureIndex) => {
    const attrs = (feature.properties ?? {}) as Record<string, unknown>;
    const stackMask = Number(attrs.stack_mask ?? 0);
    const networkLabel =
      layerId === MOORING_STACK_LAYER_ID
        ? stackNetworkLabels(stackMask).join("; ") || "Co-located moorings"
        : network;
    const wmo = String(attrs.wmo ?? "").trim();
    const rawLabel = isLine
      ? String(attrs.line_name ?? "").trim()
      : String(attrs.ptf_ref ?? "").trim();
    if (!rawLabel) return;

    const labels =
      layerId === MOORING_STACK_LAYER_ID ? splitStackRefs(rawLabel) : [rawLabel];
    for (const label of labels) {
      hits.push({
        label,
        wmo,
        network: networkLabel,
        layerId,
        isLine,
        stackMask,
        featureIndex,
      });
    }
  });
}

function splitStackRefs(value: string): string[] {
  const parts = value
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? [...new Set(parts)] : [];
}

function featureForHit(hit: SearchHit): GeoJSON.Feature | null {
  return getRawLayerGeoJson(hit.layerId)?.features[hit.featureIndex] ?? null;
}

function mapLayerIdForHit(hit: SearchHit): string {
  if (hit.layerId === MOORING_STACK_LAYER_ID) return "mooring_stacks-layer";
  if (hit.isLine) return `${hit.layerId}-solid`;
  return `${hit.layerId}-layer`;
}

function revealNetworks(hit: SearchHit): void {
  const layerIds =
    hit.layerId === MOORING_STACK_LAYER_ID
      ? stackLayerIds(hit.stackMask)
      : [hit.layerId === "soconet_moorings" ? "soconet" : hit.layerId];

  for (const layerId of new Set(layerIds)) {
    const checkbox = document.querySelector<HTMLInputElement>(
      `input[data-layer-id="${layerId}"]`
    );
    if (!checkbox || checkbox.checked) continue;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
  }
}

function stackLayerIds(stackMask: number): string[] {
  const ids: string[] = [];
  for (const layerId of Object.keys(MOORING_STACK_BITS) as MooringStackLayerId[]) {
    if ((stackMask & MOORING_STACK_BITS[layerId]) === 0) continue;
    ids.push(layerId === "soconet_moorings" ? "soconet" : layerId);
  }
  return ids;
}

type NavTarget = {
  popup: { lng: number; lat: number };
  bounds?: [[number, number], [number, number]];
};

function toDisplayNavTarget(target: NavTarget | null): NavTarget | null {
  if (!target) return null;
  const projection = getMapProjection();
  const [lng, lat] = wgs84ToDisplayLngLat(target.popup.lng, target.popup.lat, projection);
  if (!target.bounds) return { popup: { lng, lat } };

  const sw = wgs84ToDisplayLngLat(target.bounds[0][0], target.bounds[0][1], projection);
  const ne = wgs84ToDisplayLngLat(target.bounds[1][0], target.bounds[1][1], projection);
  return {
    popup: { lng, lat },
    bounds: [
      [Math.min(sw[0], ne[0]), Math.min(sw[1], ne[1])],
      [Math.max(sw[0], ne[0]), Math.max(sw[1], ne[1])],
    ],
  };
}

function navigationTarget(
  geometry: GeoJSON.Geometry | null,
  isLine: boolean
): NavTarget | null {
  if (!geometry) return null;
  if (!isLine) {
    if (geometry.type !== "Point") return null;
    const [lng, lat] = geometry.coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { popup: { lng, lat } };
  }

  const path = longestLineCoords(geometry);
  if (!path || path.length === 0) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of path) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  if (!Number.isFinite(minLng)) return null;

  return {
    popup: { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 },
    bounds: [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
  };
}

function longestLineCoords(geometry: GeoJSON.Geometry): [number, number][] | null {
  if (geometry.type === "LineString") {
    return geometry.coordinates as [number, number][];
  }
  if (geometry.type !== "MultiLineString") return null;

  let best: [number, number][] | null = null;
  let bestLen = -1;
  for (const line of geometry.coordinates) {
    const coords = line as [number, number][];
    if (coords.length < 2) continue;
    const len = approxPathLength(coords);
    if (len > bestLen) {
      bestLen = len;
      best = coords;
    }
  }
  return best;
}

function approxPathLength(coords: [number, number][]): number {
  let length = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng0, lat0] = coords[i - 1]!;
    const [lng1, lat1] = coords[i]!;
    const dLng = lng1 - lng0;
    const dLat = lat1 - lat0;
    length += Math.hypot(dLng, dLat);
  }
  return length;
}

async function flyToTarget(
  map: maplibregl.Map,
  target: NavTarget,
  isLine: boolean,
  projection: MapProjectionMode
): Promise<void> {
  const done = waitForMove(map, 800);
  if (isLine && target.bounds) {
    map.fitBounds(target.bounds, {
      padding: 64,
      duration: 700,
      maxZoom: 6,
    });
  } else {
    map.flyTo({
      center: [target.popup.lng, target.popup.lat],
      zoom: projection === "globe" ? 5 : 7,
      duration: 700,
    });
  }
  await done;
}

function waitForMove(map: maplibregl.Map, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const onEnd = () => {
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(() => {
      map.off("moveend", onEnd);
      resolve();
    }, timeoutMs);
    map.once("moveend", onEnd);
  });
}
