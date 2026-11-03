import {
  makeNetworkPicto,
  makeSoconetBreakdownPicto,
} from "./oceanops/categorySwatch";
import { closeCountryMetricsModal } from "./countryMetricsModal";
import { categories, getLayerDisplayLabel } from "./oceanops/categories";
import { closeGoshipMetricsModal, openGoshipMetricsModal } from "./oceanops/goshipMetricsModal";
import { makeNetworkIconImg } from "./oceanops/networkIcons";
import type { CountryFilterState } from "./geoJsonCountryFilter";
import { countFilteredFeatures } from "./geoJsonCountryFilter";
import type { MbnGoosTier } from "./oceanops/mooringBuoyGoosTier";

const SOCONET_MODAL_ID = "soconet-metrics-modal";
const MBN_MODAL_ID = "mbn-metrics-modal";

const NETWORK_DETAILS_PLUS_ICON = `
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
    <path d="M5.5 2.5v6M2.5 5.5h6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
  </svg>
`;

export { closeCountryMetricsModal } from "./countryMetricsModal";

export function closeSoconetMetricsModal(): void {
  document.getElementById(SOCONET_MODAL_ID)?.remove();
  document.body.classList.remove("o-country-modal-open");
}

export function closeMbnMetricsModal(): void {
  document.getElementById(MBN_MODAL_ID)?.remove();
  document.body.classList.remove("o-country-modal-open");
}

export function closeAllLegendMetricsModals(): void {
  closeCountryMetricsModal();
  closeGoshipMetricsModal();
  closeSoconetMetricsModal();
  closeMbnMetricsModal();
}

export function createLegendNetworkDetailsBtn(options: {
  ariaLabel: string;
  title: string;
  onOpen: () => void;
}): { button: HTMLButtonElement; count: HTMLSpanElement } {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "o-legend-network-details-btn";
  button.setAttribute("aria-label", options.ariaLabel);
  button.title = options.title;

  const count = document.createElement("span");
  count.className = "o-legend-count o-legend-network-details-count";
  count.textContent = "(…)";
  count.setAttribute("aria-hidden", "true");

  const icon = document.createElement("span");
  icon.className = "o-legend-network-details-icon";
  icon.innerHTML = NETWORK_DETAILS_PLUS_ICON;
  icon.setAttribute("aria-hidden", "true");

  button.append(icon, count);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onOpen();
  });

  return { button, count };
}

function mountModalShell(options: {
  id: string;
  titleId: string;
  title: string;
  titlePicto?: HTMLElement | null;
  onClose: () => void;
}): { body: HTMLDivElement; close: () => void } {
  closeAllLegendMetricsModals();
  document.body.classList.add("o-country-modal-open");

  const backdrop = document.createElement("div");
  backdrop.id = options.id;
  backdrop.className = "o-country-modal-backdrop";

  const dialog = document.createElement("div");
  dialog.className = "o-country-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", options.titleId);

  const header = document.createElement("div");
  header.className = "o-country-modal-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "o-country-modal-title-wrap";
  if (options.titlePicto) {
    const pictoWrap = document.createElement("span");
    pictoWrap.className = "o-country-modal-title-flag";
    pictoWrap.append(options.titlePicto);
    titleWrap.append(pictoWrap);
  }
  const title = document.createElement("h2");
  title.id = options.titleId;
  title.className = "o-country-modal-title";
  title.textContent = options.title;
  titleWrap.append(title);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "o-country-modal-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";

  header.append(titleWrap, closeBtn);

  const body = document.createElement("div");
  body.className = "o-country-modal-body";
  body.innerHTML = `<p class="o-country-modal-loading">Loading breakdown…</p>`;

  dialog.append(header, body);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const close = () => {
    document.removeEventListener("keydown", onKeyDown);
    options.onClose();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  document.addEventListener("keydown", onKeyDown);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  closeBtn.focus();

  return { body, close };
}

export async function openSoconetMetricsModalForMap(
  filterState: CountryFilterState
): Promise<void> {
  const titlePicto = makeNetworkIconImg("soconet");
  const { body } = mountModalShell({
    id: SOCONET_MODAL_ID,
    titleId: "o-soconet-modal-title",
    title: getLayerDisplayLabel("soconet"),
    titlePicto,
    onClose: closeSoconetMetricsModal,
  });

  const shipCount = countFilteredFeatures("soconet", filterState);
  const mooringCount = countFilteredFeatures("soconet_moorings", filterState);
  body.replaceChildren();

  const list = document.createElement("ul");
  list.className =
    "o-country-modal-list o-country-modal-list--metric-rows";

  for (const [layerId, count] of [
    ["soconet", shipCount],
    ["soconet_moorings", mooringCount],
  ] as const) {
    const item = document.createElement("li");
    const pictoSlot = document.createElement("span");
    pictoSlot.className = "o-country-modal-metric-picto-slot";
    pictoSlot.append(makeSoconetBreakdownPicto(layerId));
    const nameSpan = document.createElement("span");
    nameSpan.className = "o-country-modal-network";
    nameSpan.textContent = getLayerDisplayLabel(layerId, "modal");
    const countSpan = document.createElement("span");
    countSpan.className = "o-legend-count";
    countSpan.textContent = count.toLocaleString();
    item.append(pictoSlot, nameSpan, countSpan);
    list.appendChild(item);
  }

  body.appendChild(list);
}

const MBN_TIER_ROWS: Array<{ tier: MbnGoosTier; label: string }> = [
  {
    tier: "tropical",
    label:
      "Tropical moored buoys – MBN subcomponent, part of the global arrays",
  },
  {
    tier: "coastal",
    label:
      "Coastal and National moored buoys – MBN subcomponent, part of regional systems",
  },
];

function countMooredBuoysForTier(
  filterState: CountryFilterState,
  tier: MbnGoosTier
): number {
  return countFilteredFeatures("moored_buoys", {
    ...filterState,
    tierFilter: tier,
  });
}

export async function openMbnMetricsModalForMap(
  filterState: CountryFilterState
): Promise<void> {
  const cat = categories.find((c) => c.id === "moored_buoys");
  const titlePicto = makeNetworkPicto("moored_buoys", "country-modal");
  const { body } = mountModalShell({
    id: MBN_MODAL_ID,
    titleId: "o-mbn-modal-title",
    title: cat?.label ?? "Moored buoys",
    titlePicto,
    onClose: closeMbnMetricsModal,
  });

  body.replaceChildren();
  const list = document.createElement("ul");
  list.className =
    "o-country-modal-list o-country-modal-list--metric-rows";

  for (const row of MBN_TIER_ROWS) {
    const count = countMooredBuoysForTier(filterState, row.tier);
    const item = document.createElement("li");
    const pictoSlot = document.createElement("span");
    pictoSlot.className = "o-country-modal-metric-picto-slot";
    pictoSlot.append(makeNetworkPicto("moored_buoys", "country-modal"));
    const nameSpan = document.createElement("span");
    nameSpan.className = "o-country-modal-network";
    nameSpan.textContent = row.label;
    const countSpan = document.createElement("span");
    countSpan.className = "o-legend-count";
    countSpan.textContent = count.toLocaleString();
    item.append(pictoSlot, nameSpan, countSpan);
    list.appendChild(item);
  }

  body.appendChild(list);
}

export { openCountryMetricsModal } from "./countryMetricsModal";
export { openGoshipMetricsModal };
