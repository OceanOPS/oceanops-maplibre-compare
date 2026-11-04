import type maplibregl from "maplibre-gl";
import {
  isAllCountriesSelected,
  type CountryName,
} from "./oceanops/countryFilters";
import { getCountryIsoCode } from "./oceanops/countryFlags";
import { isGoshipSampledLineAttributes } from "./oceanops/goshipSampledLines";
import {
  getMbnGoosTierFilter,
  type MbnGoosTierFilter,
} from "./oceanops/mooringBuoyGoosTier";
import {
  getPartnerDataSnapshot,
  type PartnerCountriesFile,
} from "./oceanops/partnerCountriesData";
import { collectionForMapDisplay } from "./geoProjection";

export type CountryFilterState = {
  selectedCountries: ReadonlySet<CountryName>;
  filterableCountries: readonly CountryName[];
  tierFilter?: MbnGoosTierFilter;
};

const rawByLayerId = new Map<string, GeoJSON.FeatureCollection>();

let lastAppliedState: CountryFilterState | null = null;

export function getLastCountryFilterState(): CountryFilterState | null {
  return lastAppliedState;
}

export function registerLayerGeoJson(
  layerId: string,
  collection: GeoJSON.FeatureCollection
): void {
  rawByLayerId.set(layerId, collection);
}

export function getRawLayerGeoJson(layerId: string): GeoJSON.FeatureCollection | undefined {
  return rawByLayerId.get(layerId);
}

function isosForCountries(
  selected: ReadonlySet<CountryName>,
  snap: PartnerCountriesFile
): Set<string> {
  const isos = new Set<string>();
  for (const country of selected) {
    const iso = getCountryIsoCode(country);
    if (iso) isos.add(iso.toUpperCase());
  }
  return isos;
}

function dbNamesForCountries(
  selected: ReadonlySet<CountryName>,
  snap: PartnerCountriesFile
): Set<string> {
  const names = new Set<string>();
  const selectedSet = new Set(selected);
  for (const record of snap.countries) {
    if (record.geoCountryNames.some((geo) => selectedSet.has(geo as CountryName))) {
      names.add(record.name);
    }
  }
  return names;
}

function csvIncludesToken(csv: string, token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  return csv
    .split(",")
    .map((part) => part.trim())
    .some((part) => part === t || part.endsWith(t) || part.includes(t));
}

function csvIncludesIso(csv: unknown, iso: string): boolean {
  return csvIncludesToken(String(csv ?? ""), iso);
}

function featureMatchesPoint(
  props: Record<string, unknown>,
  isos: Set<string>
): boolean {
  const iso = String(props.country_iso_reporting ?? "").trim().toUpperCase();
  return iso.length === 2 && isos.has(iso);
}

function lineHasCountryAttribution(props: Record<string, unknown>): boolean {
  const codes = String(props.edition_country_codes ?? "").trim();
  const cruises = String(props.last_cruise_countries ?? "").trim();
  return Boolean(codes || cruises);
}

function featureMatchesGoshipLine(
  props: Record<string, unknown>,
  isos: Set<string>,
  dbNames: Set<string>
): boolean {
  if (!lineHasCountryAttribution(props)) return false;
  for (const iso of isos) {
    if (csvIncludesIso(props.edition_country_codes, iso)) return true;
  }
  for (const name of dbNames) {
    const cruises = String(props.last_cruise_countries ?? "");
    if (csvIncludesToken(cruises, name)) return true;
  }
  return false;
}

function featureMatchesOceanTraX(props: Record<string, unknown>): boolean {
  return String(props.line_status ?? "").trim().toLowerCase() === "active";
}

function passesMbnTier(props: Record<string, unknown>, tier: MbnGoosTierFilter): boolean {
  if (tier === "all") return true;
  return String(props.mbn_goos_tier ?? "").trim().toLowerCase() === tier;
}

function filterFeature(
  layerId: string,
  feature: GeoJSON.Feature,
  state: CountryFilterState,
  snap: PartnerCountriesFile
): boolean {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const { selectedCountries, filterableCountries } = state;
  const tier = state.tierFilter ?? getMbnGoosTierFilter();

  if (selectedCountries.size === 0) return false;

  const allSelected = isAllCountriesSelected(selectedCountries, filterableCountries);
  const isos = isosForCountries(selectedCountries, snap);
  const dbNames = dbNamesForCountries(selectedCountries, snap);

  if (layerId === "goship") {
    if (allSelected) return true;
    return featureMatchesGoshipLine(props, isos, dbNames);
  }

  if (layerId === "oceantrax") {
    return featureMatchesOceanTraX(props);
  }

  if (layerId === "moored_buoys" || layerId === "soconet_moorings") {
    if (!passesMbnTier(props, tier)) return false;
    if (allSelected) return true;
    return featureMatchesPoint(props, isos);
  }

  if (layerId === "mooring_stacks") {
    if (!passesMbnTier(props, tier)) return false;
    if (allSelected) return true;
    return featureMatchesPoint(props, isos);
  }

  if (allSelected) return true;
  return featureMatchesPoint(props, isos);
}

export function filteredCollection(
  layerId: string,
  state: CountryFilterState
): GeoJSON.FeatureCollection {
  const raw = rawByLayerId.get(layerId);
  if (!raw) return { type: "FeatureCollection", features: [] };
  const snap = getPartnerDataSnapshot();
  return {
    type: "FeatureCollection",
    features: raw.features.filter((f) => filterFeature(layerId, f, state, snap)),
  };
}

export function applyCountryFilterToMap(
  map: maplibregl.Map,
  state: CountryFilterState
): void {
  lastAppliedState = state;
  for (const layerId of rawByLayerId.keys()) {
    const sourceId = `${layerId}-source`;
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (!source) continue;
    source.setData(collectionForMapDisplay(filteredCollection(layerId, state)));
  }
}

export function countFilteredFeatures(
  layerId: string,
  state: CountryFilterState,
  options?: { legendSampledGoshipOnly?: boolean }
): number {
  let fc = filteredCollection(layerId, state);
  if (layerId === "goship" && options?.legendSampledGoshipOnly) {
    fc = {
      type: "FeatureCollection",
      features: fc.features.filter((f) =>
        isGoshipSampledLineAttributes((f.properties ?? {}) as Record<string, unknown>)
      ),
    };
  }
  if (layerId === "soconet") {
    const moorings = countFilteredFeatures("soconet_moorings", state);
    return fc.features.length + moorings;
  }
  return fc.features.length;
}
