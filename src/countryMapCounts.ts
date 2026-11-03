import { getLayerDisplayLabel } from "./oceanops/categories";
import {
  COUNTRY_FILTER_LAYER_IDS,
  COUNTRY_FILTER_LINE_LAYER_IDS,
  canonicalCountryFromReportingIso,
  geoCountryNamesForFilter,
  getGeoCountryLabel,
  type CountryName,
} from "./oceanops/countryFilters";
import { getCountryIsoCode, getIsoCodeForGeoCountry } from "./oceanops/countryFlags";
import { parseColocatedMembersFromAttrs } from "./oceanops/colocatedPlatforms";
import {
  countryNameMatchesFilter,
  geoCountryKeyFromDbName,
  isCrossCountryCruise,
  parseProgramCountryNames,
} from "./oceanops/lineCrossCountryCruise";
import { listGoshipSampledLineNamesForCountry } from "./oceanops/goshipCountryLineCounts";
import type { MbnGoosTier } from "./oceanops/mooringBuoyGoosTier";
import {
  formatCountryModalMetric,
  getCountryBreakdownFromPartner,
  getPartnerDataSnapshot,
  type CountryLayerCount,
} from "./oceanops/partnerCountriesData";
import { getRawLayerGeoJson } from "./geoJsonCountryFilter";
import {
  MOORING_STACK_LAYER_ID,
  SOCONET_MOORING_COUNT_FIELD,
  type MooringStackLayerId,
} from "./mooring/mooringStackConstants";

export type CountryContributorCount = {
  geoCountry: string;
  label: string;
  isoCode?: string;
  count: number;
  displayCount: string;
};

export type PlatformCountryCount = {
  layerId: string;
  label: string;
  geoCountry: string;
  countryLabel: string;
  isoCode?: string;
  count: number;
  displayCount: string;
};

export type PlatformWithCountries = {
  layerId: string;
  label: string;
  count: number;
  displayCount: string;
  countries: CountryContributorCount[];
};

export type CountryLineNetworkDetail = CountryLayerCount & {
  lineNames: string[];
};

const labelByLayerId = (layerId: string) => getLayerDisplayLabel(layerId, "modal");

const MOORING_LAYER_IDS = new Set<MooringStackLayerId>([
  "moored_buoys",
  "oceansites",
  "soconet_moorings",
]);

const MBN_TIER_MODAL_LABELS = {
  tropical: "Tropical moored buoys – MBN subcomponent",
  coastal: "Coastal and National moored buoys – MBN subcomponent",
} as const;

function reportingIsoMatchesCountry(
  props: Record<string, unknown>,
  country: CountryName
): boolean {
  const iso = getCountryIsoCode(country)?.toUpperCase();
  if (!iso) return false;
  const reporting = String(props.country_iso_reporting ?? "")
    .trim()
    .toUpperCase();
  return reporting === iso;
}

function shipFlagMatchesCountry(
  props: Record<string, unknown>,
  country: CountryName
): boolean {
  const ship = String(props.country_ship ?? "").trim();
  if (!ship || ship.toUpperCase() === "UNKNOWN") return false;
  return countryNameMatchesFilter(country, ship);
}

function matchesShipCrossCountry(
  props: Record<string, unknown>,
  country: CountryName
): boolean {
  if (!shipFlagMatchesCountry(props, country)) return false;
  const iso = getCountryIsoCode(country)?.toUpperCase();
  const reporting = String(props.country_iso_reporting ?? "")
    .trim()
    .toUpperCase();
  return reporting.length === 2 && reporting !== iso;
}

function csvIncludesToken(csv: string, token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  return csv
    .split(",")
    .map((part) => part.trim())
    .some((part) => part === t || part.endsWith(t) || part.includes(t));
}

function sensorProviderMatchesCountry(
  props: Record<string, unknown>,
  country: CountryName
): boolean {
  const csv = String(props.country_sensor_provider ?? "");
  if (!csv.trim()) return false;
  for (const name of geoCountryNamesForFilter(country)) {
    if (csvIncludesToken(csv, name)) return true;
  }
  return false;
}

function matchesSensorCrossCountry(
  props: Record<string, unknown>,
  country: CountryName
): boolean {
  if (!sensorProviderMatchesCountry(props, country)) return false;
  const iso = getCountryIsoCode(country)?.toUpperCase();
  const reporting = String(props.country_iso_reporting ?? "")
    .trim()
    .toUpperCase();
  return reporting.length === 2 && reporting !== iso;
}

function featureProps(layerId: string): Record<string, unknown>[] {
  return (getRawLayerGeoJson(layerId)?.features ?? []).map(
    (f) => (f.properties ?? {}) as Record<string, unknown>
  );
}

function countSoloFeatures(
  layerId: string,
  predicate: (props: Record<string, unknown>) => boolean
): number {
  return featureProps(layerId).filter(predicate).length;
}

function countMooringStackMembers(
  layerId: MooringStackLayerId,
  predicate: (props: Record<string, unknown>) => boolean
): number {
  let total = 0;
  for (const props of featureProps(MOORING_STACK_LAYER_ID)) {
    if (!predicate(props)) continue;
    if (layerId === "soconet_moorings") {
      const n = Number(props[SOCONET_MOORING_COUNT_FIELD]);
      total += Number.isFinite(n) && n > 0 ? n : 1;
      continue;
    }
    const members = parseColocatedMembersFromAttrs(props);
    for (const member of members) {
      if (member.layer_id === layerId) total += 1;
    }
  }
  return total;
}

function countMooringNetwork(
  layerId: MooringStackLayerId,
  predicate: (props: Record<string, unknown>) => boolean
): number {
  return (
    countSoloFeatures(layerId, predicate) +
    countMooringStackMembers(layerId, predicate)
  );
}

function countLayerForCountry(
  layerId: string,
  country: CountryName,
  predicate: (props: Record<string, unknown>) => boolean
): number {
  const base = (props: Record<string, unknown>) =>
    reportingIsoMatchesCountry(props, country) && predicate(props);

  if (MOORING_LAYER_IDS.has(layerId as MooringStackLayerId)) {
    return countMooringNetwork(layerId as MooringStackLayerId, base);
  }
  return countSoloFeatures(layerId, base);
}

function mooredBuoyTierBreakdownForCountry(
  country: CountryName
): CountryLayerCount[] {
  const rows: CountryLayerCount[] = [];
  for (const tier of ["tropical", "coastal"] as const satisfies MbnGoosTier[]) {
    const predicate = (props: Record<string, unknown>) =>
      String(props.mbn_goos_tier ?? "").trim().toLowerCase() === tier;
    const count = countMooringNetwork("moored_buoys", (props) =>
      reportingIsoMatchesCountry(props, country) && predicate(props)
    );
    if (count > 0) {
      rows.push({
        layerId: "moored_buoys",
        label: MBN_TIER_MODAL_LABELS[tier],
        count,
        displayCount: formatCountryModalMetric(count),
      });
    }
  }
  return rows;
}

function addReportingIsoCounts(
  totals: Map<string, number>,
  propsList: readonly Record<string, unknown>[]
): void {
  for (const props of propsList) {
    const raw = props.country_iso_reporting;
    if (typeof raw !== "string" || !raw.trim()) continue;
    const key = canonicalCountryFromReportingIso(raw);
    if (!key) continue;
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
}

function iterateCrossCountryFeatures(
  country: CountryName,
  matchCross: (props: Record<string, unknown>) => boolean,
  visibleLayerIds: ReadonlySet<string>
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const layerId of COUNTRY_FILTER_LAYER_IDS) {
    if (!visibleLayerIds.has(layerId)) continue;
    for (const props of featureProps(layerId)) {
      if (matchCross(props)) out.push(props);
    }
  }
  return out;
}

export async function getCountryTotalFromMap(
  country: CountryName,
  visibleLayerIds: ReadonlySet<string>
): Promise<number> {
  let total = 0;
  for (const layerId of COUNTRY_FILTER_LAYER_IDS) {
    if (!visibleLayerIds.has(layerId)) continue;
    total += countLayerForCountry(layerId, country, () => true);
  }
  return total;
}

export async function getCountryBreakdownFromMap(
  country: CountryName,
  visibleLayerIds: ReadonlySet<string>
): Promise<CountryLayerCount[]> {
  const rows: CountryLayerCount[] = [];
  for (const layerId of COUNTRY_FILTER_LAYER_IDS) {
    if (!visibleLayerIds.has(layerId)) continue;
    const count = countLayerForCountry(layerId, country, () => true);
    if (count === 0) continue;
    rows.push({
      layerId,
      label: labelByLayerId(layerId),
      count,
      displayCount: formatCountryModalMetric(count),
    });
  }
  return rows;
}

function oceanTraxLineDetailFromPartner(
  country: CountryName,
  visibleLayerIds: ReadonlySet<string>
): CountryLineNetworkDetail | null {
  if (!visibleLayerIds.has("oceantrax")) return null;
  const row = getCountryBreakdownFromPartner(
    country,
    getPartnerDataSnapshot(),
    visibleLayerIds
  ).find((entry) => entry.layerId === "oceantrax");
  if (!row || row.count <= 0) return null;
  return { ...row, lineNames: [] };
}

export async function getCountryLineDetailsFromMap(
  country: CountryName,
  visibleLayerIds: ReadonlySet<string>
): Promise<CountryLineNetworkDetail[]> {
  const details: CountryLineNetworkDetail[] = [];

  if (visibleLayerIds.has("goship")) {
    const lineNames = await listGoshipSampledLineNamesForCountry(country);
    if (lineNames.length > 0) {
      details.push({
        layerId: "goship",
        label: labelByLayerId("goship"),
        count: lineNames.length,
        displayCount: formatCountryModalMetric(lineNames.length),
        lineNames,
      });
    }
  }

  const oceantrax = oceanTraxLineDetailFromPartner(country, visibleLayerIds);
  if (oceantrax) details.push(oceantrax);

  return details.sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );
}

export async function getCountryOperatedBreakdownFromMap(
  country: CountryName,
  visibleLayerIds: ReadonlySet<string>
): Promise<CountryLayerCount[]> {
  const [platformRows, lineDetails] = await Promise.all([
    getCountryBreakdownFromMap(country, visibleLayerIds),
    getCountryLineDetailsFromMap(country, visibleLayerIds),
  ]);
  const lineRows: CountryLayerCount[] = lineDetails.map(
    ({ layerId, label, count, displayCount }) => ({
      layerId,
      label,
      count,
      displayCount,
    })
  );

  let platformBreakdown = platformRows.filter(
    (row) => row.layerId !== "moored_buoys"
  );
  if (visibleLayerIds.has("moored_buoys")) {
    platformBreakdown = [
      ...platformBreakdown,
      ...mooredBuoyTierBreakdownForCountry(country),
    ];
  }

  return [...platformBreakdown, ...lineRows].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );
}

export async function getCountrySensorTotalFromMap(
  country: CountryName,
  visibleLayerIds: ReadonlySet<string>
): Promise<number> {
  return iterateCrossCountryFeatures(
    country,
    (props) => matchesSensorCrossCountry(props, country),
    visibleLayerIds
  ).length;
}

export async function getCountryShipPlatformCountryBreakdownFromMap(
  country: CountryName,
  visibleLayerIds: ReadonlySet<string>
): Promise<PlatformCountryCount[]> {
  const rows: PlatformCountryCount[] = [];
  for (const layerId of COUNTRY_FILTER_LAYER_IDS) {
    if (!visibleLayerIds.has(layerId)) continue;
    const totals = new Map<string, number>();
    for (const props of featureProps(layerId)) {
      if (!matchesShipCrossCountry(props, country)) continue;
      const raw = props.country_iso_reporting;
      if (typeof raw !== "string" || !raw.trim()) continue;
      const key = canonicalCountryFromReportingIso(raw);
      if (!key) continue;
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    for (const [geoCountry, count] of totals.entries()) {
      if (count === 0) continue;
      rows.push({
        layerId,
        label: labelByLayerId(layerId),
        geoCountry,
        countryLabel: getGeoCountryLabel(geoCountry),
        isoCode: getIsoCodeForGeoCountry(geoCountry),
        count,
        displayCount: formatCountryModalMetric(count),
      });
    }
  }
  return rows.sort(
    (a, b) =>
      b.count - a.count ||
      a.label.localeCompare(b.label) ||
      a.countryLabel.localeCompare(b.countryLabel)
  );
}

export async function getCountryLineCrossCruisePlatformCountryBreakdownFromMap(
  country: CountryName,
  visibleLayerIds: ReadonlySet<string>
): Promise<PlatformCountryCount[]> {
  const rows: PlatformCountryCount[] = [];

  for (const layerId of COUNTRY_FILTER_LINE_LAYER_IDS) {
    if (layerId === "oceantrax") continue;
    if (!visibleLayerIds.has(layerId)) continue;

    const totals = new Map<string, number>();

    for (const props of featureProps(layerId)) {
      const shipCountry = String(props.last_cruise_ship_country ?? "").trim();
      const programCountries = String(props.last_cruise_countries ?? "").trim();
      if (!countryNameMatchesFilter(country, shipCountry)) continue;
      if (!isCrossCountryCruise(shipCountry, programCountries)) continue;

      for (const forName of parseProgramCountryNames(programCountries)) {
        if (countryNameMatchesFilter(country, forName)) continue;
        const geoCountry = geoCountryKeyFromDbName(forName);
        totals.set(geoCountry, (totals.get(geoCountry) ?? 0) + 1);
      }
    }

    const networkLabel = labelByLayerId(layerId);
    for (const [geoCountry, count] of totals.entries()) {
      if (count === 0) continue;
      rows.push({
        layerId,
        label: networkLabel,
        geoCountry,
        countryLabel: getGeoCountryLabel(geoCountry),
        isoCode: getIsoCodeForGeoCountry(geoCountry),
        count,
        displayCount: formatCountryModalMetric(count),
      });
    }
  }

  return rows.sort(
    (a, b) =>
      b.count - a.count ||
      a.label.localeCompare(b.label) ||
      a.countryLabel.localeCompare(b.countryLabel)
  );
}

export async function getCountrySensorPlatformCountryBreakdownFromMap(
  country: CountryName,
  visibleLayerIds: ReadonlySet<string>
): Promise<PlatformCountryCount[]> {
  const rows: PlatformCountryCount[] = [];

  for (const layerId of COUNTRY_FILTER_LAYER_IDS) {
    if (!visibleLayerIds.has(layerId)) continue;
    const totals = new Map<string, number>();
    const matched = featureProps(layerId).filter((props) =>
      matchesSensorCrossCountry(props, country)
    );
    addReportingIsoCounts(totals, matched);

    for (const [geoCountry, count] of totals.entries()) {
      if (count === 0) continue;
      rows.push({
        layerId,
        label: labelByLayerId(layerId),
        geoCountry,
        countryLabel: getGeoCountryLabel(geoCountry),
        isoCode: getIsoCodeForGeoCountry(geoCountry),
        count,
        displayCount: formatCountryModalMetric(count),
      });
    }
  }

  return rows.sort(
    (a, b) =>
      b.count - a.count ||
      a.label.localeCompare(b.label) ||
      a.countryLabel.localeCompare(b.countryLabel)
  );
}

export function groupPlatformCountryRows(
  rows: PlatformCountryCount[]
): PlatformWithCountries[] {
  const byLayer = new Map<string, PlatformWithCountries>();

  for (const row of rows) {
    let platform = byLayer.get(row.layerId);
    if (!platform) {
      platform = {
        layerId: row.layerId,
        label: row.label,
        count: 0,
        displayCount: "",
        countries: [],
      };
      byLayer.set(row.layerId, platform);
    }

    platform.count += row.count;
    platform.countries.push({
      geoCountry: row.geoCountry,
      label: row.countryLabel,
      isoCode: row.isoCode,
      count: row.count,
      displayCount: row.displayCount,
    });
  }

  return [...byLayer.values()]
    .map((platform) => ({
      ...platform,
      displayCount: formatCountryModalMetric(platform.count),
      countries: platform.countries.sort(
        (a, b) => b.count - a.count || a.label.localeCompare(b.label)
      ),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function mergePlatformCountryRows(
  ...groups: PlatformCountryCount[][]
): PlatformCountryCount[] {
  const merged = new Map<string, PlatformCountryCount>();

  for (const rows of groups) {
    for (const row of rows) {
      const key = `${row.layerId}\0${row.geoCountry}`;
      const existing = merged.get(key);
      if (existing) {
        existing.count += row.count;
        existing.displayCount = formatCountryModalMetric(existing.count);
      } else {
        merged.set(key, { ...row });
      }
    }
  }

  return [...merged.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.label.localeCompare(b.label) ||
      a.countryLabel.localeCompare(b.countryLabel)
  );
}
