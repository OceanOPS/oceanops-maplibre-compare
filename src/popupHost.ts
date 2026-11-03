import type maplibregl from "maplibre-gl";

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

function ensureHost(map: maplibregl.Map): HTMLDivElement {
  const container = map.getContainer();
  if (!host) {
    host = document.createElement("div");
    host.className = "o-maplibre-popup-host";
    host.hidden = true;
    host.innerHTML = `
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
  shellEl?.classList.toggle("o-maplibre-popup--paged", multi);

  if (multi) {
    statusEl.textContent = `${pageIndex + 1} of ${pages.length}`;
    prevBtn.disabled = pageIndex <= 0;
    nextBtn.disabled = pageIndex >= pages.length - 1;
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

export function closeMapPopup(): void {
  moveCleanup?.();
  moveCleanup = null;
  pageCleanup?.();
  pageCleanup = null;
  pages = [];
  pageIndex = 0;
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
}): void {
  if (options.pages.length === 0) return;

  const { map, lngLat } = options;
  closeMapPopup();
  ensureHost(map);

  pages = options.pages;
  pageIndex = 0;
  renderPage();
  bindPagination();

  const place = () => {
    const p = map.project(lngLat);
    shellEl!.style.left = `${p.x}px`;
    shellEl!.style.top = `${p.y}px`;
  };
  place();
  host!.hidden = false;

  const onMove = () => place();
  map.on("move", onMove);
  moveCleanup = () => map.off("move", onMove);
}
