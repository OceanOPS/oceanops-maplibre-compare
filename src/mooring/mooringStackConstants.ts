import { categories } from "../oceanops/categories";

/** Co-located mooring overlay layer id (Esri map). */
export const MOORING_STACK_LAYER_ID = "mooring_stacks";

/** Stack pins: how many SOCONET mooring platforms share this coordinate. */
export const SOCONET_MOORING_COUNT_FIELD = "soconet_mooring_count";

export const MOORING_STACK_BITS = {
  moored_buoys: 1,
  oceansites: 2,
  soconet_moorings: 4,
} as const;

export type MooringStackLayerId = keyof typeof MOORING_STACK_BITS;

/** JSON on stack-layer features: one entry per exported platform × map layer. */
export type MooringStackMember = {
  layer_id: MooringStackLayerId;
  ptf_ref: string;
  ptf_id?: number;
  wigos_ref?: string;
  goos_networks?: string;
  /** OceanSITES reference observatory site name(s) (see oceansites.geojson). */
  site_names?: string;
  country_name?: string;
  country_iso_reporting?: string;
};

export const STACK_MEMBERS_JSON_FIELD = "stack_members_json";

export const MOORING_OPERATIONAL_LAYER_IDS: MooringStackLayerId[] = [
  "moored_buoys",
  "oceansites",
  "soconet_moorings",
];

const STACK_LABEL_LAYER_ORDER: MooringStackLayerId[] = [
  "moored_buoys",
  "oceansites",
  "soconet_moorings",
];

/** Legend labels for each network present in a co-located stack (e.g. MB + OceanSITES). */
export function stackNetworkLabels(stackMask: number): string[] {
  const labels: string[] = [];
  for (const layerId of STACK_LABEL_LAYER_ORDER) {
    if ((stackMask & MOORING_STACK_BITS[layerId]) === 0) continue;
    const cat = categories.find((entry) => entry.id === layerId);
    if (cat) labels.push(cat.label);
  }
  return labels;
}
