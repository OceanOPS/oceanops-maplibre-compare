import { makeCategorySwatch } from "./oceanops/categorySwatch";
import {
  getCountryLabel,
  isAllCountriesSelected,
  type CountryName,
} from "./oceanops/countryFilters";
import { appendCountryFlag, getCountryIsoCode } from "./oceanops/countryFlags";
import {
  getGoshipLegendCount,
  getNetworkLegendTotal,
  getPartnerDataSnapshot,
} from "./oceanops/partnerCountriesData";
import {
  closeAllLegendMetricsModals,
  createLegendNetworkDetailsBtn,
  openCountryMetricsModal,
  openGoshipMetricsModal,
  openMbnMetricsModalForMap,
  openSoconetMetricsModalForMap,
} from "./mapMetricsModals";
import {
  categories,
  isGlobalArraysCategory,
  isLegendRowCategory,
  isReferenceObservatoryCategory,
  isRegionalSystemsCategory,
  legendLayerIdsForCategory,
  type Category,
} from "./categories";
import type { CountryFilterController } from "./countryFilterController";
import { createCollapsibleGroup } from "./legendCollapsible";
import { assetUrl } from "./assetUrl";

const MENU_TOGGLE_HINT = {
  closed: "Show map legend and contributing countries",
  open: "Hide map legend and contributing countries",
} as const;

const menuToggleIconClosed = `
  <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden="true">
    <rect x="1" y="1" width="18" height="14" rx="2" stroke="#f8f8f8" stroke-width="1.75"/>
    <path d="M7 1V15" stroke="#f8f8f8" stroke-width="1.75"/>
    <path d="M10 5H16" stroke="#f8f8f8" stroke-width="1.75" stroke-linecap="round"/>
    <path d="M10 8H16" stroke="#f8f8f8" stroke-width="1.75" stroke-linecap="round"/>
    <path d="M10 11H14" stroke="#f8f8f8" stroke-width="1.75" stroke-linecap="round"/>
  </svg>
`;

const menuToggleIconOpen = `
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M10 3L5 8L10 13" stroke="#f8f8f8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

function formatNetworkLegendCount(value: number): string {
  return `(${value.toLocaleString()})`;
}

export type LegendCallbacks = {
  onVisibilityChange: (cat: Category, visible: boolean) => void;
  isVisible: (cat: Category) => boolean;
  onLayoutChange?: () => void;
  getCountryFilter: () => CountryFilterController | null;
};

function setMenuToggleState(button: HTMLButtonElement, isOpen: boolean): void {
  button.classList.toggle("is-open", isOpen);
  button.setAttribute("aria-expanded", String(isOpen));
  button.setAttribute(
    "aria-label",
    isOpen ? MENU_TOGGLE_HINT.open : MENU_TOGGLE_HINT.closed
  );
  const icon = button.querySelector(".o-legend-toggle__icon");
  if (icon) icon.innerHTML = isOpen ? menuToggleIconOpen : menuToggleIconClosed;
  const hint = button.querySelector(".o-legend-toggle__hint");
  if (hint) {
    hint.textContent = isOpen ? MENU_TOGGLE_HINT.open : MENU_TOGGLE_HINT.closed;
  }
}

function createCheckboxRow(labelText: string) {
  const row = document.createElement("label");
  row.className = "o-legend-filter-row";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;
  const text = document.createElement("span");
  text.className = "o-legend-filter-row-label";
  text.textContent = labelText;
  row.append(checkbox, text);
  return { row, checkbox, text };
}

export function mountLegend(callbacks: LegendCallbacks): {
  toggleButton: HTMLButtonElement;
  open: () => void;
  close: () => void;
  refreshCounts: () => void;
} {
  document.getElementById("legend-backdrop")?.remove();
  document.getElementById("legend")?.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "legend-backdrop";
  backdrop.className = "o-legend-backdrop";
  document.body.appendChild(backdrop);

  const panel = document.createElement("aside");
  panel.id = "legend";
  panel.className = "o-legend-panel";
  document.body.appendChild(panel);

  const toggleButton = document.createElement("button");
  toggleButton.id = "legend-toggle";
  toggleButton.type = "button";
  toggleButton.className = "o-legend-toggle o-map-control-with-hint";
  toggleButton.innerHTML = `
    <span class="o-legend-toggle__icon">${menuToggleIconClosed}</span>
    <span class="o-legend-toggle__hint o-map-toolbar-hint">${MENU_TOGGLE_HINT.closed}</span>
  `;
  setMenuToggleState(toggleButton, false);

  const setOpen = (open: boolean) => {
    panel.classList.toggle("open", open);
    backdrop.classList.toggle("open", open);
    document.body.classList.toggle("menu-open", open);
    setMenuToggleState(toggleButton, open);
    if (!open) closeAllLegendMetricsModals();
    callbacks.onLayoutChange?.();
  };

  let exportMetadata: Record<string, string> | null = null;
  void fetch(`${import.meta.env.BASE_URL}geojson/export-metadata.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data && typeof data === "object") exportMetadata = data as Record<string, string>;
    })
    .catch(() => undefined);

  toggleButton.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
  backdrop.addEventListener("click", () => setOpen(false));

  const content = document.createElement("div");
  content.className = "o-legend-content";
  content.innerHTML = `
    <div class="o-legend-header">
      <div class="o-legend-header-content">
        <img src="${assetUrl("/img/oceanops-w.png")}" alt="OceanOPS" class="o-legend-logo" />
        <div class="o-legend-title"><h4>In Situ Networks as Monitored by OceanOPS</h4></div>
      </div>
      <button type="button" class="o-legend-close" aria-label="Close menu">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>
  `;
  panel.appendChild(content);
  content.querySelector(".o-legend-close")?.addEventListener("click", () => setOpen(false));

  type NetworkListFilter = "all" | "globalArrays" | "regionalSystems" | "refObs";
  let networkListFilter: NetworkListFilter = "all";
  const layerCheckboxById = new Map<string, HTMLInputElement>();
  const networkRowWrappers = new Map<string, HTMLElement>();
  const countNodes = new Map<string, HTMLElement>();
  const countryTotalNodes = new Map<CountryName, HTMLSpanElement>();

  const legendRowCategories = (): Category[] =>
    categories.filter(isLegendRowCategory) as Category[];

  const getVisibleNetworkLayerIds = (): Set<string> => {
    const visible = new Set<string>();
    for (const cat of legendRowCategories()) {
      const cb = layerCheckboxById.get(cat.id);
      if (!cb?.checked) continue;
      for (const id of legendLayerIdsForCategory(cat)) visible.add(id);
    }
    return visible;
  };

  const getVisibleNetworkCategoryIds = (): string[] => {
    const rows = legendRowCategories();
    if (networkListFilter === "globalArrays") {
      return rows.filter((c) => isGlobalArraysCategory(c.id)).map((c) => c.id);
    }
    if (networkListFilter === "regionalSystems") {
      return rows.filter((c) => isRegionalSystemsCategory(c.id)).map((c) => c.id);
    }
    if (networkListFilter === "refObs") {
      return rows.filter((c) => isReferenceObservatoryCategory(c.id)).map((c) => c.id);
    }
    return rows.map((c) => c.id);
  };

  const syncNetworkRowVisibility = () => {
    const visible = new Set(getVisibleNetworkCategoryIds());
    for (const cat of legendRowCategories()) {
      const row = networkRowWrappers.get(cat.id);
      if (row) row.hidden = !visible.has(cat.id);
    }
  };

  const refreshCounts = () => {
    const filter = callbacks.getCountryFilter();
    if (!filter) return;
    const snap = getPartnerDataSnapshot();
    const allCountriesSelected = isAllCountriesSelected(
      filter.selectedCountries,
      filter.filterableCountries
    );

    for (const cat of legendRowCategories()) {
      const node = countNodes.get(cat.id);
      if (!node) continue;
      if (cat.id === "goship") {
        const total = getGoshipLegendCount(
          filter.selectedCountries,
          filter.filterableCountries
        );
        node.textContent = formatNetworkLegendCount(total);
        node.title = `${total.toLocaleString()} edition cruises (lead program country)`;
        continue;
      }
      if (cat.id === "oceantrax" && allCountriesSelected) {
        const total = getNetworkLegendTotal("oceantrax", snap);
        node.textContent =
          total != null
            ? formatNetworkLegendCount(total)
            : formatNetworkLegendCount(filter.countLayer("oceantrax"));
        continue;
      }
      node.textContent = formatNetworkLegendCount(
        filter.countLayer(cat.id, cat.id === "goship")
      );
    }

    const visibleLayers = getVisibleNetworkLayerIds();
    for (const country of filter.filterableCountries) {
      const nodes = countryTotalNodes.get(country);
      if (!nodes) continue;
      const n = filter.countCountryPrograms(country, visibleLayers);
      nodes.textContent = formatNetworkLegendCount(n);
    }
  };

  const { groupBody: networksBody } = createCollapsibleGroup(content, {
    key: "networks",
    title: "Networks",
    startOpen: true,
  });

  const networkGroupBtnRow = document.createElement("div");
  networkGroupBtnRow.className =
    "o-legend-country-group-btns o-legend-network-group-btns";

  const setNetworkFilter = (filter: NetworkListFilter, activeBtn: HTMLButtonElement) => {
    networkListFilter = filter;
    networkGroupBtnRow
      .querySelectorAll("button")
      .forEach((b) => b.classList.toggle("active", b === activeBtn));
    syncNetworkRowVisibility();
    callbacks.getCountryFilter()?.setMbnTierFromNetworkFilter(
      filter === "globalArrays"
        ? "globalArrays"
        : filter === "regionalSystems"
          ? "regionalSystems"
          : "all"
    );
    refreshCounts();
  };

  const mkFilterBtn = (label: string, filter: NetworkListFilter) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "o-legend-country-group-btn";
    btn.textContent = label;
    btn.addEventListener("click", () => setNetworkFilter(filter, btn));
    return btn;
  };

  const allBtn = mkFilterBtn("All", "all");
  allBtn.classList.add("active");
  networkGroupBtnRow.append(
    allBtn,
    mkFilterBtn("Global arrays", "globalArrays"),
    mkFilterBtn("Reference observatories", "refObs"),
    mkFilterBtn("Regional systems", "regionalSystems")
  );
  networksBody.appendChild(networkGroupBtnRow);

  const networkList = document.createElement("div");
  networkList.className = "o-legend-network-list";
  networksBody.appendChild(networkList);

  for (const cat of legendRowCategories()) {
    const { row, checkbox } = createCheckboxRow(cat.label);
    const swatch = makeCategorySwatch(cat);
    row.insertBefore(swatch, row.children[1]);

    let countEl: HTMLSpanElement;
    if (cat.id === "goship") {
      const { button, count } = createLegendNetworkDetailsBtn({
        ariaLabel: "View GO-SHIP decadal reference lines",
        title: "View GO-SHIP decadal reference lines",
        onOpen: () => {
          const since =
            exportMetadata?.GOSHIP_EDITION_SINCE ??
            exportMetadata?.GOSHIP_SAMPLED_SINCE ??
            "2025-01-01";
          const until =
            exportMetadata?.OBS_PERIOD_UNTIL ??
            exportMetadata?.exportedAt ??
            new Date().toISOString().slice(0, 10);
          void openGoshipMetricsModal(since, until);
        },
      });
      countEl = count;
      row.appendChild(button);
    } else if (cat.id === "soconet") {
      const { button, count } = createLegendNetworkDetailsBtn({
        ariaLabel: "View SOCONET breakdown",
        title: "View SOCONET breakdown (ships + moored buoys)",
        onOpen: () => {
          const cf = callbacks.getCountryFilter();
          if (!cf) return;
          void openSoconetMetricsModalForMap(cf.getFilterState());
        },
      });
      countEl = count;
      row.appendChild(button);
    } else if (cat.id === "moored_buoys") {
      const { button, count } = createLegendNetworkDetailsBtn({
        ariaLabel: "View MBN breakdown (tropical and coastal moored buoys)",
        title: "View MBN breakdown by GOOS tier",
        onOpen: () => {
          const cf = callbacks.getCountryFilter();
          if (!cf) return;
          void openMbnMetricsModalForMap(cf.getFilterState());
        },
      });
      countEl = count;
      row.appendChild(button);
    } else {
      countEl = document.createElement("span");
      countEl.className = "o-legend-count";
      countEl.textContent = "(…)";
      row.appendChild(countEl);
    }
    countNodes.set(cat.id, countEl);

    checkbox.checked = callbacks.isVisible(cat);
    checkbox.dataset.layerId = cat.id;
    checkbox.addEventListener("change", () => {
      callbacks.onVisibilityChange(cat, checkbox.checked);
      refreshCounts();
    });

    layerCheckboxById.set(cat.id, checkbox);
    networkRowWrappers.set(cat.id, row);
    networkList.appendChild(row);
  }

  syncNetworkRowVisibility();

  const { groupBody: countryBody } = createCollapsibleGroup(content, {
    key: "country",
    title: "Contributing countries",
    startOpen: true,
  });

  const countryGroupBtnRow = document.createElement("div");
  countryGroupBtnRow.className = "o-legend-country-group-btns";

  const mkCountryListBtn = (label: string, filter: "all" | "g7" | "eu" | "sids") => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "o-legend-country-group-btn";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      const cf = callbacks.getCountryFilter();
      if (!cf) return;
      if (filter === "all") cf.toggleAllInList();
      else cf.applyCountryListFilter(filter);
      countryGroupBtnRow.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      syncCountryCheckboxes();
      refreshCounts();
    });
    return btn;
  };

  const countryAllBtn = mkCountryListBtn("All", "all");
  countryAllBtn.classList.add("active");
  countryGroupBtnRow.append(countryAllBtn);

  const countryList = document.createElement("div");
  countryList.className = "o-legend-country-list";

  const syncCountryCheckboxes = () => {
    const cf = callbacks.getCountryFilter();
    if (!cf) return;
    for (const country of cf.filterableCountries) {
      const row = countryList.querySelector<HTMLElement>(
        `[data-country="${country}"]`
      );
      const input = row?.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (input) input.checked = cf.selectedCountries.has(country);
    }
    const visible = new Set(cf.getVisibleListCountries());
    for (const country of cf.filterableCountries) {
      const row = countryList.querySelector<HTMLElement>(
        `[data-country="${country}"]`
      );
      if (row) row.hidden = !visible.has(country);
    }
  };

  const mountCountryRows = () => {
    const cf = callbacks.getCountryFilter();
    if (!cf) return;
    countryList.replaceChildren();
    countryTotalNodes.clear();

    const sorted = [...cf.filterableCountries].sort((a, b) =>
      getCountryLabel(a).localeCompare(getCountryLabel(b))
    );

    for (const country of sorted) {
      const label = getCountryLabel(country);
      const { row, checkbox, text: name } = createCheckboxRow(label);
      row.classList.add("o-legend-country-row");
      name.className = "o-legend-country-name";
      row.setAttribute("data-country", country);

      const flag = document.createElement("span");
      flag.className = "o-legend-country-flag";
      appendCountryFlag(flag, getCountryIsoCode(country), label);
      row.insertBefore(flag, name);

      const { button: metricsBtn, count: total } = createLegendNetworkDetailsBtn({
        ariaLabel: `View metrics for ${label}`,
        title: "View network breakdown",
        onOpen: () => {
          const cf = callbacks.getCountryFilter();
          if (!cf) return;
          void openCountryMetricsModal(country, getVisibleNetworkLayerIds);
        },
      });
      row.appendChild(metricsBtn);
      countryTotalNodes.set(country, total);

      checkbox.checked = cf.selectedCountries.has(country);
      checkbox.addEventListener("change", () => {
        cf.setCountry(country, checkbox.checked);
        refreshCounts();
      });

      countryList.appendChild(row);
    }

    if (cf.g7Filterable.length > 0 && !countryGroupBtnRow.querySelector('[data-filter="g7"]')) {
      const g7 = mkCountryListBtn("G7", "g7");
      g7.dataset.filter = "g7";
      countryGroupBtnRow.insertBefore(g7, countryAllBtn.nextSibling);
    }
    if (cf.euFilterable.length > 0 && !countryGroupBtnRow.querySelector('[data-filter="eu"]')) {
      const eu = mkCountryListBtn("EU", "eu");
      eu.dataset.filter = "eu";
      countryGroupBtnRow.appendChild(eu);
    }
    if (cf.sidsFilterable.length > 0 && !countryGroupBtnRow.querySelector('[data-filter="sids"]')) {
      const sids = mkCountryListBtn("SIDS", "sids");
      sids.dataset.filter = "sids";
      sids.title =
        "Small Island Developing States (UN OHRLLS list — contributing countries on this map)";
      countryGroupBtnRow.appendChild(sids);
    }

    syncCountryCheckboxes();
  };

  countryBody.append(countryGroupBtnRow, countryList);

  const footer = document.createElement("div");
  footer.className = "o-legend-footer";
  const disclaimer = document.createElement("p");
  disclaimer.className = "o-legend-disclaimer";
  disclaimer.innerHTML =
    'Disclaimer: The depiction and use of boundaries, geographic names and related data shown on the OceanOPS map and included in country lists and tables are not warranted to be error free nor do they imply official endorsement or acceptance by the Intergovernmental Oceanographic Commission of UNESCO and the World Meteorological Organization. Statistics in this report are gradually made more accurate by OceanOPS based on data and metadata availability. Please contact <a href="mailto:support@ocean-ops.org" target="_blank" rel="noopener noreferrer">support@ocean-ops.org</a> for any discrepancies.';
  footer.append(disclaimer);
  content.appendChild(footer);

  const cf = callbacks.getCountryFilter();
  if (cf) {
    mountCountryRows();
    cf.onChange(() => {
      syncCountryCheckboxes();
      refreshCounts();
    });
  }

  return {
    toggleButton,
    open: () => setOpen(true),
    close: () => setOpen(false),
    refreshCounts: () => {
      if (countryList.childElementCount === 0) mountCountryRows();
      refreshCounts();
    },
  };
}

export { legendLayerIdsForCategory };
