import type maplibregl from "maplibre-gl";
import {
  EU_COUNTRIES,
  G7_COUNTRIES,
  SIDS_COUNTRIES,
  isAllCountriesSelected,
  type CountryName,
} from "./oceanops/countryFilters";
import {
  setMbnGoosTierFilter,
  type MbnGoosTierFilter,
} from "./oceanops/mooringBuoyGoosTier";
import { getFilterableCountryNames } from "./oceanops/partnerCountriesData";
import {
  applyCountryFilterToMap,
  countFilteredFeatures,
  type CountryFilterState,
} from "./geoJsonCountryFilter";
import { refreshMooringStackLayer } from "./mooringStackLayer";

export type CountryListFilter = "all" | "g7" | "eu" | "sids";

export function createCountryFilterController(map: maplibregl.Map) {
  const filterableCountries = getFilterableCountryNames();
  const filterableSet = new Set<string>(filterableCountries);
  const selectedCountries = new Set<CountryName>(filterableCountries);
  let countryListFilter: CountryListFilter = "all";
  let mbnTier: MbnGoosTierFilter = "all";
  const listeners = new Set<() => void>();

  const g7Filterable = G7_COUNTRIES.filter((c) => filterableSet.has(c));
  const euFilterable = EU_COUNTRIES.filter((c) => filterableSet.has(c));
  const sidsFilterable = SIDS_COUNTRIES.filter((c) => filterableSet.has(c));

  const state = (): CountryFilterState => ({
    selectedCountries,
    filterableCountries,
    tierFilter: mbnTier,
  });

  const notify = () => listeners.forEach((cb) => cb());

  const apply = () => {
    setMbnGoosTierFilter(mbnTier);
    applyCountryFilterToMap(map, state());
    refreshMooringStackLayer(map, state());
    notify();
  };

  const getVisibleListCountries = (): CountryName[] => {
    if (countryListFilter === "g7") return g7Filterable;
    if (countryListFilter === "eu") return euFilterable;
    if (countryListFilter === "sids") return sidsFilterable;
    return [...filterableCountries].sort((a, b) => a.localeCompare(b));
  };

  return {
    getFilterState: (): CountryFilterState => state(),
    filterableCountries,
    g7Filterable,
    euFilterable,
    sidsFilterable,
    selectedCountries,
    getVisibleListCountries,
    getCountryListFilter: () => countryListFilter,
    setMbnTierFromNetworkFilter(filter: "all" | "globalArrays" | "regionalSystems") {
      if (filter === "globalArrays") mbnTier = "tropical";
      else if (filter === "regionalSystems") mbnTier = "coastal";
      else mbnTier = "all";
      apply();
    },
    setCountry(country: CountryName, checked: boolean) {
      if (checked) selectedCountries.add(country);
      else selectedCountries.delete(country);
      apply();
    },
    applyCountryListFilter(filter: CountryListFilter) {
      countryListFilter = filter;
      selectedCountries.clear();
      if (filter === "all") {
        for (const c of filterableCountries) selectedCountries.add(c);
      } else {
        for (const c of getVisibleListCountries()) selectedCountries.add(c);
      }
      apply();
    },
    toggleAllInList() {
      if (
        countryListFilter === "all" &&
        isAllCountriesSelected(selectedCountries, filterableCountries)
      ) {
        selectedCountries.clear();
      } else {
        selectedCountries.clear();
        if (countryListFilter === "all") {
          for (const c of filterableCountries) selectedCountries.add(c);
        } else {
          for (const c of getVisibleListCountries()) selectedCountries.add(c);
        }
      }
      apply();
    },
    apply,
    onChange(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    countLayer(layerId: string, legendGoshipSampled = false): number {
      return countFilteredFeatures(layerId, state(), {
        legendSampledGoshipOnly: legendGoshipSampled,
      });
    },
    countCountryPrograms(country: CountryName, visibleLayerIds: Set<string>): number {
      const saved = new Set(selectedCountries);
      selectedCountries.clear();
      selectedCountries.add(country);
      let total = 0;
      for (const layerId of visibleLayerIds) {
        if (layerId === "soconet_moorings") continue;
        total += countFilteredFeatures(layerId, state());
      }
      selectedCountries.clear();
      for (const c of saved) selectedCountries.add(c);
      return total;
    },
  };
}

export type CountryFilterController = ReturnType<typeof createCountryFilterController>;
