import type maplibregl from "maplibre-gl";
import { focusMapOnLngLat } from "./mapFocusOnSelection";
import {
  clearSelectionHighlight,
  setSelectionHighlight,
} from "./selectionHighlight";

export type MapPopupPage = {
  title: string;
  html: string;
};

/** Esri-style popup chrome for MapLibre (title + HTML body, optional pagination). */

let host: HTMLDivElement | null = null;
let shellEl: HTMLDivElement | null = null;
let titleEl: HTMLHeadingElement | null = null;
let bodyEl: HTMLDivElement | null = null;
let navEl: HTMLElement | null = null;
let prevBtn: HTMLButtonElement | null = null;
let nextBtn: HTMLButtonElement | null = null;
let statusEl: HTMLSpanElement | null = null;
let moveCleanup: (() => void) | null = null;
let pageCleanup: (() => void) | null = null;

let pages: MapPopupPage[] = [];
let pageIndex = 0;
let popupMap: maplibregl.Map | null = null;
let leaderSvg: SVGSVGElement | null = null;
let leaderLine: SVGLineElement | null = null;
let popupLngLat: { lng: number; lat: number } | null = null;
let popupHighlightStyle: MapSelectionStyle = "marker";
let popupHighlightFeature: GeoJSON.Feature | undefined;

/** How the map emphasizes the selected platform under the popup. */
export type MapSelectionStyle = "marker" | "line" | "leader";

function ensureHost(map: maplibregl.Map): HTMLDivElement {
  const container = map.getContainer();
  if (!host) {
    host = document.createElement("div");
    host.className = "o-maplibre-popup-host";
    host.hidden = true;
    host.innerHTML = `
    <svg class="o-maplibre-popup__leader" aria-hidden="true" hidden>
      <line />
    </svg>
    <div class="o-maplibre-popup" role="dialog" aria-modal="false">
      <header class="o-maplibre-popup__header">
        <h2 class="o-maplibre-popup__title"></h2>
        <button type="button" class="o-maplibre-popup__close" aria-label="Close">×</button>
      </header>
      <nav class="o-maplibre-popup__nav" aria-label="Popup pages" hidden>
        <button type="button" class="o-maplibre-popup__nav-btn o-maplibre-popup__nav-btn--prev">Previous</button>
        <span class="o-maplibre-popup__nav-status"></span>
        <button type="button" class="o-maplibre-popup__nav-btn o-maplibre-popup__nav-btn--next">Next</button>
      </nav>
      <div class="o-maplibre-popup__body" tabindex="0"></div>
    </div>
  `;
    shellEl = host.querySelector(".o-maplibre-popup")!;
    titleEl = host.querySelector(".o-maplibre-popup__title")!;
    bodyEl = host.querySelector(".o-maplibre-popup__body")!;
    navEl = host.querySelector(".o-maplibre-popup__nav")!;
    prevBtn = host.querySelector(".o-maplibre-popup__nav-btn--prev")!;
    nextBtn = host.querySelector(".o-maplibre-popup__nav-btn--next")!;
    statusEl = host.querySelector(".o-maplibre-popup__nav-status")!;
    leaderSvg = host.querySelector(".o-maplibre-popup__leader");
    leaderLine = leaderSvg?.querySelector("line") ?? null;
    host.querySelector(".o-maplibre-popup__close")!.addEventListener("click", () => {
      closeMapPopup();
    });
  }
  if (host.parentElement !== container) container.appendChild(host);
  return host;
}

function renderPage(): void {
  const page = pages[pageIndex];
  if (!page || !titleEl || !bodyEl || !navEl || !prevBtn || !nextBtn || !statusEl) return;

  titleEl.textContent = page.title;
  bodyEl.innerHTML = page.html;

  const multi = pages.length > 1;
  navEl.hidden = !multi;
  navEl.style.display = multi ? "" : "none";
  shellEl?.classList.toggle("o-maplibre-popup--paged", multi);

  if (multi) {
    statusEl.textContent = `${pageIndex + 1} of ${pages.length}`;
    prevBtn.disabled = pageIndex <= 0;
    nextBtn.disabled = pageIndex >= pages.length - 1;
  }

  if (popupMap && popupLngLat) {
    const ll = popupLngLat;
    requestAnimationFrame(() => updatePopupLeader(popupMap!, ll));
  }
}

function goToPage(nextIndex: number): void {
  if (nextIndex < 0 || nextIndex >= pages.length) return;
  pageIndex = nextIndex;
  renderPage();
}

function bindPagination(): void {
  pageCleanup?.();
  if (!prevBtn || !nextBtn || !bodyEl || pages.length <= 1) {
    pageCleanup = null;
    return;
  }

  const onPrev = (event: Event) => {
    event.preventDefault();
    goToPage(pageIndex - 1);
  };
  const onNext = (event: Event) => {
    event.preventDefault();
    goToPage(pageIndex + 1);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (pages.length <= 1) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToPage(pageIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goToPage(pageIndex + 1);
    }
  };

  prevBtn.addEventListener("click", onPrev);
  nextBtn.addEventListener("click", onNext);
  bodyEl.addEventListener("keydown", onKeyDown);

  pageCleanup = () => {
    prevBtn?.removeEventListener("click", onPrev);
    nextBtn?.removeEventListener("click", onNext);
    bodyEl?.removeEventListener("keydown", onKeyDown);
  };
}

function updatePopupLeader(map: maplibregl.Map, lngLat: { lng: number; lat: number }): void {
  if (!leaderSvg || !leaderLine || !shellEl || !host) return;
  if (popupHighlightStyle !== "leader") {
    leaderSvg.setAttribute("hidden", "");
    return;
  }
  const anchor = map.project(lngLat);
  const shell = shellEl.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  const x1 = shell.left + shell.width / 2 - hostRect.left;
  const y1 = shell.bottom - hostRect.top;
  leaderLine.setAttribute("x1", String(x1));
  leaderLine.setAttribute("y1", String(y1));
  leaderLine.setAttribute("x2", String(anchor.x));
  leaderLine.setAttribute("y2", String(anchor.y));
  leaderSvg.removeAttribute("hidden");
}

export function closeMapPopup(): void {
  moveCleanup?.();
  moveCleanup = null;
  pageCleanup?.();
  pageCleanup = null;
  pages = [];
  pageIndex = 0;
  popupLngLat = null;
  popupHighlightFeature = undefined;
  popupHighlightStyle = "marker";
  if (leaderSvg) leaderSvg.setAttribute("hidden", "");
  if (popupMap) clearSelectionHighlight(popupMap);
  popupMap = null;
  if (host) host.hidden = true;
}

export function showMapPopup(options: {
  title: string;
  html: string;
  lngLat: { lng: number; lat: number };
  map: maplibregl.Map;
}): void {
  showMapPopupPages({
    map: options.map,
    lngLat: options.lngLat,
    pages: [{ title: options.title, html: options.html }],
  });
}

export function showMapPopupPages(options: {
  pages: MapPopupPage[];
  lngLat: { lng: number; lat: number };
  map: maplibregl.Map;
  /** Pan/zoom to the marker when opening (default true; search flies first). */
  focusOnOpen?: boolean;
  /** Marker ring (all point/image markers) or track line (line layers only). */
  highlightStyle?: MapSelectionStyle;
  highlightFeature?: GeoJSON.Feature;
}): void {
  if (options.pages.length === 0) return;

  const { map, lngLat } = options;
  closeMapPopup();
  ensureHost(map);
  popupMap = map;
  popupLngLat = lngLat;
  popupHighlightStyle = options.highlightStyle ?? "marker";
  popupHighlightFeature = options.highlightFeature;

  if (options.focusOnOpen !== false) {
    focusMapOnLngLat(map, lngLat);
  }

  const mapHighlightStyle =
    popupHighlightStyle === "line"
      ? "line"
      : popupHighlightStyle === "leader"
        ? "none"
        : "marker";
  setSelectionHighlight(map, {
    lngLat,
    style: mapHighlightStyle,
    feature: popupHighlightFeature,
  });

  pages = options.pages;
  pageIndex = 0;
  renderPage();
  bindPagination();

  const place = () => {
    const p = map.project(lngLat);
    shellEl!.style.left = `${p.x}px`;
    shellEl!.style.top = `${p.y}px`;
    updatePopupLeader(map, lngLat);
  };
  place();
  host!.hidden = false;

  const onMove = () => place();
  map.on("move", onMove);
  moveCleanup = () => map.off("move", onMove);
}
