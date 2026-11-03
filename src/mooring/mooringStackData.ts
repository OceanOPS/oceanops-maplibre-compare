import {
  MOORING_STACK_BITS,
  SOCONET_MOORING_COUNT_FIELD,
  STACK_MEMBERS_JSON_FIELD,
  type MooringStackLayerId,
  type MooringStackMember,
} from "./mooringStackConstants";
import {
  MAP_SQUARE_MARKER_SIZE,
  MOORING_NESTED_STACK_SIZES,
  MOORING_STACK_BORDER_WIDTH,
  MOORING_TWO_STACK_SIZE,
} from "../oceanops/categories";

const STACK_LABEL_LAYER_ORDER: MooringStackLayerId[] = [
  "moored_buoys",
  "oceansites",
  "soconet_moorings",
];

function uniqueNonEmptyStrings(...values: unknown[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    ordered.push(trimmed);
  }
  return ordered;
}

function joinUniqueStrings(...values: unknown[]): string {
  return uniqueNonEmptyStrings(...values).join(" / ");
}

function memberFromFeature(
  layerId: MooringStackLayerId,
  properties: Record<string, unknown>
): MooringStackMember {
  const ptfIdRaw = properties.ptf_id;
  const ptfId =
    typeof ptfIdRaw === "number"
      ? ptfIdRaw
      : ptfIdRaw != null && ptfIdRaw !== ""
        ? Number(ptfIdRaw)
        : undefined;

  const member: MooringStackMember = {
    layer_id: layerId,
    ptf_ref: String(properties.ptf_ref ?? "").trim(),
  };
  if (ptfId != null && !Number.isNaN(ptfId)) member.ptf_id = ptfId;

  const wigos = String(properties.wigos_ref ?? properties.wigos_id ?? "").trim();
  if (wigos) member.wigos_ref = wigos;

  const goos = String(properties.goos_networks ?? "").trim();
  if (goos) member.goos_networks = goos;

  const siteNames = String(properties.site_names ?? "").trim();
  if (siteNames) member.site_names = siteNames;

  const country = String(properties.country_name ?? "").trim();
  if (country) member.country_name = country;

  const iso = String(properties.country_iso_reporting ?? "").trim();
  if (iso) member.country_iso_reporting = iso;

  return member;
}

function buildStackMembers(
  entry: Partial<Record<MooringStackLayerId, PointFeature[]>>,
  stackMask: number
): MooringStackMember[] {
  const members: MooringStackMember[] = [];
  for (const layerId of STACK_LABEL_LAYER_ORDER) {
    if ((stackMask & MOORING_STACK_BITS[layerId]) === 0) continue;
    for (const feature of entry[layerId] ?? []) {
      members.push(memberFromFeature(layerId, feature.properties));
    }
  }
  return members;
}

export const SOLO_BIT_TO_LAYER: Record<number, MooringStackLayerId> = {
  1: "moored_buoys",
  2: "oceansites",
  4: "soconet_moorings",
};

/** Display mask → PNG basename (outer → inner, e.g. mb-on-oceansites). */
export const STACK_PNG_BY_MASK: Record<number, string> = {
  3: "stack-mb-on-oceansites",
  5: "stack-mb-on-soconet",
  6: "stack-oceansites-on-soconet",
  7: "stack-mb-on-oceansites-on-soconet",
};

export const PNG_DISPLAY_SIZE: Record<number, number> = {
  3: MOORING_TWO_STACK_SIZE + 2 * MOORING_STACK_BORDER_WIDTH,
  5: MOORING_TWO_STACK_SIZE + 2 * MOORING_STACK_BORDER_WIDTH,
  6: MOORING_TWO_STACK_SIZE + 2 * MOORING_STACK_BORDER_WIDTH,
  7: MOORING_NESTED_STACK_SIZES.moored_buoys + 2 * MOORING_STACK_BORDER_WIDTH,
};

export type MooringStackVisibility = {
  mooredBuoys: boolean;
  oceansites: boolean;
  soconetMoorings: boolean;
};

type PointFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: PointFeature[];
};

export type MooringStackData = {
  mooredBuoysSolo: string;
  oceansitesSolo: string;
  soconetMooringsSolo: string;
  stackLayer: string;
};

const COORD_DECIMALS = 4;
/** Bump when stack grouping rules change (forces rebuild of blob URLs). */
const MOORING_STACK_DATA_VERSION = 4;
let cachedData: MooringStackData | null = null;
let cachedDataVersion = 0;
const blobUrls: string[] = [];

function totalPlatformsAtEntry(
  entry: Partial<Record<MooringStackLayerId, PointFeature[]>>
): number {
  let count = 0;
  for (const layerId of STACK_LABEL_LAYER_ORDER) {
    count += entry[layerId]?.length ?? 0;
  }
  return count;
}

/** One stack pin + paginated popup vs several solo features + Esri “1 of N”. */
function shouldBuildMooringStack(
  stackMask: number,
  entry: Partial<Record<MooringStackLayerId, PointFeature[]>>
): boolean {
  if (popCount(stackMask) >= 2) return true;
  return totalPlatformsAtEntry(entry) >= 2;
}

export function popCount(mask: number): number {
  let count = 0;
  let value = mask;
  while (value) {
    count += value & 1;
    value >>= 1;
  }
  return count;
}

export function mooringCoordKey(lon: number, lat: number): string {
  return `${lon.toFixed(COORD_DECIMALS)},${lat.toFixed(COORD_DECIMALS)}`;
}

/** Shared WMO / array id for platforms at one mooring site (coords may differ slightly in exports). */
export function mooringArrayKey(
  properties: Record<string, unknown>
): string | undefined {
  const wmo = String(properties.wmo ?? properties.gts_id ?? "").trim();
  if (wmo) return `wmo:${wmo}`;

  const ref = String(properties.ptf_ref ?? "").trim();
  const refMatch = ref.match(/^(\d+)_/);
  if (refMatch) return `wmo:${refMatch[1]}`;

  const wigos = String(properties.wigos_ref ?? properties.wigos_id ?? "").trim();
  const wigosMatch = wigos.match(/-(\d+)$/);
  if (wigosMatch) return `wmo:${wigosMatch[1]}`;

  return undefined;
}

function parsePtfId(properties: Record<string, unknown>): number | undefined {
  const raw = properties.ptf_id;
  if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

type TaggedMooringFeature = {
  layerId: MooringStackLayerId;
  feature: PointFeature;
  nativeKey: string;
  arrayKey?: string;
  ptfId?: number;
};

function addFeatureToEntry(
  byKey: Map<string, Partial<Record<MooringStackLayerId, PointFeature[]>>>,
  key: string,
  layerId: MooringStackLayerId,
  feature: PointFeature
): void {
  const entry = byKey.get(key) ?? {};
  const list = entry[layerId] ?? [];
  list.push(feature);
  entry[layerId] = list;
  byKey.set(key, entry);
}

function scoreCoordKeyForAnchor(features: TaggedMooringFeature[]): number {
  let score = features.length;
  if (features.some((f) => f.layerId === "moored_buoys")) score += 1000;
  if (features.some((f) => f.layerId === "oceansites")) score += 100;
  if (features.some((f) => f.layerId === "soconet_moorings")) score += 10;
  return score;
}

function chooseAnchorCoordKey(features: TaggedMooringFeature[]): string {
  const byNative = new Map<string, TaggedMooringFeature[]>();
  for (const tagged of features) {
    const list = byNative.get(tagged.nativeKey) ?? [];
    list.push(tagged);
    byNative.set(tagged.nativeKey, list);
  }

  let bestKey = features[0]!.nativeKey;
  let bestScore = -1;
  for (const [nativeKey, group] of byNative) {
    const score = scoreCoordKeyForAnchor(group);
    if (score > bestScore) {
      bestScore = score;
      bestKey = nativeKey;
    }
  }
  return bestKey;
}

function buildMooringLocationIndex(
  mooredBuoys: FeatureCollection,
  oceansites: FeatureCollection,
  soconetMoorings: FeatureCollection
): Map<string, Partial<Record<MooringStackLayerId, PointFeature[]>>> {
  const tagged: TaggedMooringFeature[] = [];

  const tagLayer = (layerId: MooringStackLayerId, collection: FeatureCollection) => {
    for (const feature of collection.features) {
      if (feature.geometry?.type !== "Point") continue;
      const [lon, lat] = feature.geometry.coordinates;
      tagged.push({
        layerId,
        feature,
        nativeKey: mooringCoordKey(lon, lat),
        arrayKey: mooringArrayKey(feature.properties),
        ptfId: parsePtfId(feature.properties),
      });
    }
  };

  tagLayer("moored_buoys", mooredBuoys);
  tagLayer("oceansites", oceansites);
  tagLayer("soconet_moorings", soconetMoorings);

  const byArray = new Map<string, TaggedMooringFeature[]>();
  for (const item of tagged) {
    if (!item.arrayKey) continue;
    const list = byArray.get(item.arrayKey) ?? [];
    list.push(item);
    byArray.set(item.arrayKey, list);
  }

  const arrayAnchorKey = new Map<string, string>();
  for (const [arrayKey, group] of byArray) {
    const nativeKeys = new Set(group.map((g) => g.nativeKey));
    if (group.length < 2 && nativeKeys.size < 2) continue;
    arrayAnchorKey.set(arrayKey, chooseAnchorCoordKey(group));
  }

  const ptfAnchorKey = new Map<number, string>();
  const byKey = new Map<
    string,
    Partial<Record<MooringStackLayerId, PointFeature[]>>
  >();

  for (const item of tagged) {
    let key = item.nativeKey;
    if (item.arrayKey && arrayAnchorKey.has(item.arrayKey)) {
      key = arrayAnchorKey.get(item.arrayKey)!;
    } else if (item.ptfId != null && ptfAnchorKey.has(item.ptfId)) {
      key = ptfAnchorKey.get(item.ptfId)!;
    }

    addFeatureToEntry(byKey, key, item.layerId, item.feature);
    if (item.ptfId != null) ptfAnchorKey.set(item.ptfId, key);
  }

  return byKey;
}

async function fetchGeoJson(url: string): Promise<FeatureCollection> {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return (await response.json()) as FeatureCollection;
}

function toBlobUrl(collection: FeatureCollection): string {
  return URL.createObjectURL(
    new Blob([JSON.stringify(collection)], { type: "application/json" })
  );
}

function soloFeatures(
  collection: FeatureCollection,
  stackedKeys: Set<string>,
  stackedArrayKeys: Set<string>
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.filter((feature) => {
      const arrayKey = mooringArrayKey(feature.properties);
      if (arrayKey && stackedArrayKeys.has(arrayKey)) return false;
      const [lon, lat] = feature.geometry.coordinates;
      return !stackedKeys.has(mooringCoordKey(lon, lat));
    }),
  };
}

/** Split mooring GeoJSON into solo layers + one stacked-location overlay. */
export async function loadMooringStackData(baseUrl: string): Promise<MooringStackData> {
  if (cachedData && cachedDataVersion === MOORING_STACK_DATA_VERSION) {
    return cachedData;
  }

  const [oceansites, soconetMoorings, mooredBuoys] = await Promise.all([
    fetchGeoJson(`${baseUrl}geojson/oceansites.geojson`),
    fetchGeoJson(`${baseUrl}geojson/soconet_moorings.geojson`),
    fetchGeoJson(`${baseUrl}geojson/moored_buoys.geojson`),
  ]);

  const byKey = buildMooringLocationIndex(
    mooredBuoys,
    oceansites,
    soconetMoorings
  );

  const soconetCountAtKey = new Map<string, number>();
  for (const [key, entry] of byKey) {
    const count = entry.soconet_moorings?.length ?? 0;
    if (count > 0) soconetCountAtKey.set(key, count);
  }

  const stackedKeys = new Set<string>();
  const stackedArrayKeys = new Set<string>();
  const stackFeatures: PointFeature[] = [];

  for (const [key, entry] of byKey) {
    let stackMask = 0;
    if (entry.moored_buoys?.length) stackMask |= MOORING_STACK_BITS.moored_buoys;
    if (entry.oceansites?.length) stackMask |= MOORING_STACK_BITS.oceansites;
    if (entry.soconet_moorings?.length) {
      stackMask |= MOORING_STACK_BITS.soconet_moorings;
    }

    if (!shouldBuildMooringStack(stackMask, entry)) continue;

    stackedKeys.add(key);
    for (const layerId of STACK_LABEL_LAYER_ORDER) {
      for (const feature of entry[layerId] ?? []) {
        const arrayKey = mooringArrayKey(feature.properties);
        if (arrayKey) stackedArrayKeys.add(arrayKey);
      }
    }

    const anchor =
      entry.moored_buoys?.[0] ??
      entry.oceansites?.[0] ??
      entry.soconet_moorings?.[0]!;

    const stackMembers = buildStackMembers(entry, stackMask);

    const ptfRef = joinUniqueStrings(...stackMembers.map((m) => m.ptf_ref));

    const ptfModel = joinUniqueStrings(
      ...STACK_LABEL_LAYER_ORDER.flatMap((layerId) =>
        (entry[layerId] ?? []).map((f) => f.properties?.ptf_model)
      ),
      anchor.properties?.ptf_model
    );

    const ptfFamilyName = joinUniqueStrings(
      ...STACK_LABEL_LAYER_ORDER.flatMap((layerId) =>
        (entry[layerId] ?? []).map((f) => f.properties?.ptf_family_name)
      ),
      anchor.properties?.ptf_family_name
    );

    const stackProps: Record<string, unknown> = {
      ...anchor.properties,
      stack_mask: stackMask,
      ptf_ref: ptfRef,
      ptf_model: ptfModel || anchor.properties?.ptf_model,
      ...(ptfFamilyName ? { ptf_family_name: ptfFamilyName } : {}),
      [STACK_MEMBERS_JSON_FIELD]: JSON.stringify(stackMembers),
    };
    if ((stackMask & MOORING_STACK_BITS.soconet_moorings) !== 0) {
      stackProps[SOCONET_MOORING_COUNT_FIELD] = soconetCountAtKey.get(key) ?? 1;
    }

    stackFeatures.push({
      type: "Feature",
      geometry: anchor.geometry,
      properties: stackProps,
    });
  }

  for (const url of blobUrls) URL.revokeObjectURL(url);
  blobUrls.length = 0;

  const data: MooringStackData = {
    mooredBuoysSolo: toBlobUrl(
      soloFeatures(mooredBuoys, stackedKeys, stackedArrayKeys)
    ),
    oceansitesSolo: toBlobUrl(
      soloFeatures(oceansites, stackedKeys, stackedArrayKeys)
    ),
    soconetMooringsSolo: toBlobUrl(
      soloFeatures(soconetMoorings, stackedKeys, stackedArrayKeys)
    ),
    stackLayer: toBlobUrl({
      type: "FeatureCollection",
      features: stackFeatures,
    }),
  };

  blobUrls.push(
    data.mooredBuoysSolo,
    data.oceansitesSolo,
    data.soconetMooringsSolo,
    data.stackLayer
  );
  cachedData = data;
  cachedDataVersion = MOORING_STACK_DATA_VERSION;
  return data;
}


export function computeStackDisplayMask(
  stackMask: number,
  visibility: MooringStackVisibility
): number {
  let d = 0;
  if ((stackMask & MOORING_STACK_BITS.moored_buoys) !== 0 && visibility.mooredBuoys) {
    d |= MOORING_STACK_BITS.moored_buoys;
  }
  if ((stackMask & MOORING_STACK_BITS.oceansites) !== 0 && visibility.oceansites) {
    d |= MOORING_STACK_BITS.oceansites;
  }
  if ((stackMask & MOORING_STACK_BITS.soconet_moorings) !== 0 && visibility.soconetMoorings) {
    d |= MOORING_STACK_BITS.soconet_moorings;
  }
  return d;
}

export function stackPngUrlForDisplayMask(displayMask: number, baseUrl = "/"): string {
  const basename = STACK_PNG_BY_MASK[displayMask];
  if (!basename) return "";
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  return base + "img/mooring-stacks/" + basename + ".png";
}

export function stackIconDisplaySize(displayMask: number): number {
  return PNG_DISPLAY_SIZE[displayMask] ?? MAP_SQUARE_MARKER_SIZE;
}
