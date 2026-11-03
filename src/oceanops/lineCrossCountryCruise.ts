import {
  geoCountryNamesForFilter,
  getCountryLabel,
  isDisplayableGeoCountry,
  isIgnoredGeoCountry,
  normalizeGeoCountryKey,
  type CountryName,
} from "./countryFilters";
import { getIsoCodeForGeoCountry } from "./countryFlags";

export function countryNamesMatch(a: string, b: string): boolean {
  const left = a.trim().toUpperCase();
  const right = b.trim().toUpperCase();
  if (!left || !right) return false;
  if (isIgnoredGeoCountry(left) || isIgnoredGeoCountry(right)) return false;
  if (left === right) return true;

  const isoLeft = getIsoCodeForGeoCountry(a);
  const isoRight = getIsoCodeForGeoCountry(b);
  return isoLeft !== undefined && isoLeft === isoRight;
}

export function countryNameMatchesFilter(
  country: CountryName,
  dbName: string
): boolean {
  const names = geoCountryNamesForFilter(country);
  return names.some(
    (geo) =>
      countryNamesMatch(geo, dbName) ||
      countryNamesMatch(getCountryLabel(geo as CountryName), dbName)
  );
}

export function isCrossCountryCruise(
  shipCountry: string,
  programCountriesCsv: string
): boolean {
  const ship = shipCountry.trim();
  if (!ship || isIgnoredGeoCountry(ship)) return false;
  const programCountries = programCountriesCsv
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (programCountries.length === 0) return false;
  return !programCountries.some((name) => countryNamesMatch(ship, name));
}

export function parseProgramCountryNames(csv: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of csv.split(",")) {
    const trimmed = raw.trim();
    if (!isDisplayableGeoCountry(trimmed)) continue;
    const upper = trimmed.toUpperCase();
    if (seen.has(upper)) continue;
    seen.add(upper);
    names.push(normalizeGeoCountryKey(trimmed) ?? upper);
  }
  return names;
}

export function geoCountryKeyFromDbName(dbCountryName: string): string {
  const trimmed = dbCountryName.trim();
  const direct = normalizeGeoCountryKey(trimmed);
  if (direct) return direct;

  const upper = trimmed.toUpperCase();
  if (isDisplayableGeoCountry(trimmed)) return upper;

  return upper;
}
