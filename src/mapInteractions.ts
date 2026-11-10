import type maplibregl from "maplibre-gl";
import { categories, type Category } from "./categories";
import { parseColocatedMembersFromAttrs } from "./oceanops/colocatedPlatforms";
import {
  buildLinePopupHtmlForCategory,
  linePopupTitleForCategory,
  buildPlatformInspectPopupHtml,
  platformInspectTitleForLayer,
  isColocatedPopupLayer,
  memberFromPlatformAttributes,
} from "./popupHtml";
import {
  groupStackMembers,
  platformRefForGroup,
  stackGroupPageInnerHtml,
} from "./oceanops/platformPopup";
import { platformInspectPopupTitle, stackInspectPopupTitle } from "./oceanops/platformInspect";
import type { ColocatedPlatformMember } from "./oceanops/colocatedPlatforms";
import { featureAnchorLngLat } from "./featureAnchorLngLat";
import { categoryIdFromMapLayer, interactiveLayerIds } from "./layerIds";
import {
  closeMapPopup,
  showMapPopupPages,
  type MapPopupPage,
  type MapSelectionStyle,
} from "./popupHost";

function propsFromFeature(
  feature: GeoJSON.Feature
): Record<string, unknown> {
  return (feature.properties ?? {}) as Record<string, unknown>;
}

function categoryForLayerId(layerId: string): Category | undefined {
  const catId = categoryIdFromMapLayer(layerId);
  return categories.find((c) => c.id === catId);
}

function memberPageTitle(member: ColocatedPlatformMember, attrs: Record<string, unknown>): string {
  return platformInspectPopupTitle(
    member.layer_id,
    member.ptf_ref,
    { ...attrs, ptf_ref: member.ptf_ref, layer_id: member.layer_id }
  );
}

function stackGroupTitle(group: ColocatedPlatformMember[]): string {
  const ref = platformRefForGroup(group);
  const first = group[0];
  if (!first) return ref || "Platform";
  const typeName = platformInspectPopupTitle(first.layer_id, first.ptf_ref, {
    ptf_ref: first.ptf_ref,
  });
  if (ref && typeName.includes(" - ")) return typeName;
  return ref ? `${ref} - ${typeName.split(" - ").pop() ?? "Platform"}` : typeName;
}

function pagesFromStackMembers(members: ColocatedPlatformMember[], attrs: Record<string, unknown>): MapPopupPage[] {
  const groups = groupStackMembers(members);
  return groups.map((group) => ({
    title: stackGroupTitle(group),
    html: `<div class="o-map-popup o-map-popup--inspect o-map-popup--stack o-map-popup--stack-paged">${stackGroupPageInnerHtml(group)}</div>`,
  }));
}

/** One MapLibre hit per layer can still describe the same platform — paginate only when refs differ. */
function uniquePlatformMembers(
  members: ColocatedPlatformMember[]
): ColocatedPlatformMember[] {
  const seen = new Set<string>();
  const out: ColocatedPlatformMember[] = [];
  for (const member of members) {
    const ref = member.ptf_ref.trim();
    const key = ref || `layer:${member.layer_id}:id:${member.ptf_id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(member);
  }
  return out;
}

function pagesFromColocatedHits(
  hits: Array<{ feature: GeoJSON.Feature; layerId: string }>
): MapPopupPage[] {
  const pages: MapPopupPage[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const catId = categoryIdFromMapLayer(hit.layerId);
    if (!catId) continue;
    const attrs = propsFromFeature(hit.feature);
    const member = memberFromPlatformAttributes(catId, attrs);
    const ref = member.ptf_ref.trim();
    const key = ref || `layer:${member.layer_id}:id:${member.ptf_id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pages.push({
      title: memberPageTitle(member, attrs),
      html: buildPlatformInspectPopupHtml(member.layer_id, {
        ...attrs,
        ptf_ref: member.ptf_ref,
      }),
    });
  }
  return pages;
}

/** Low zoom: widen pick so stacked ship icons register together. */
const COLOCATED_PICK_MAX_ZOOM = 5.75;
const COLOCATED_PICK_BOX_PX = 14;
/** Catch ship-on-buoy stacks when zoomed in (mixed symbol sizes). */
const COLOCATED_PICK_MIN_PX = 12;
/** Paginate only when anchor pixels still overlap (dezoomed stack). */
const COLOCATED_MERGE_MAX_SCREEN_PX = 20;

function colocatedHitsOverlapOnScreen(
  map: maplibregl.Map,
  hits: Array<{ feature: GeoJSON.Feature; layerId: string }>,
  fallbackLngLat: { lng: number; lat: number }
): boolean {
  if (hits.length < 2) return false;
  const pixels = hits.map((h) =>
    map.project(featureAnchorLngLat(h.feature, fallbackLngLat))
  );
  let maxSep = 0;
  for (let i = 0; i < pixels.length; i++) {
    for (let j = i + 1; j < pixels.length; j++) {
      const dx = pixels[i]!.x - pixels[j]!.x;
      const dy = pixels[i]!.y - pixels[j]!.y;
      maxSep = Math.max(maxSep, Math.hypot(dx, dy));
    }
  }
  return maxSep <= COLOCATED_MERGE_MAX_SCREEN_PX;
}

export type OpenFeaturePopupOptions = {
  focusOnOpen?: boolean;
};

function mapSelectionStyleForCategory(
  cat: Category | undefined
): MapSelectionStyle {
  if (!cat) return "marker";
  if (cat.type === "line") return "line";
  return "marker";
}

function selectionHighlightForFeature(
  feature: GeoJSON.Feature,
  cat: Category | undefined
): { highlightStyle: MapSelectionStyle; highlightFeature: GeoJSON.Feature } {
  return {
    highlightStyle: mapSelectionStyleForCategory(cat),
    highlightFeature: feature,
  };
}

export async function openFeaturePopup(
  map: maplibregl.Map,
  feature: GeoJSON.Feature,
  layerId: string,
  lngLat: { lng: number; lat: number },
  options?: OpenFeaturePopupOptions
): Promise<void> {
  return popupForFeature(map, feature, layerId, lngLat, options);
}

async function popupForFeature(
  map: maplibregl.Map,
  feature: GeoJSON.Feature,
  layerId: string,
  lngLat: { lng: number; lat: number },
  options?: OpenFeaturePopupOptions
): Promise<void> {
  const popupOpts = { focusOnOpen: options?.focusOnOpen };
  const cat = categoryForLayerId(layerId);
  const anchor =
    cat?.type === "line" ? lngLat : featureAnchorLngLat(feature, lngLat);
  const attrs = propsFromFeature(feature);
  const stackHighlight = {
    highlightStyle: "marker" as const,
    highlightFeature: feature,
  };
  const platformHighlight = selectionHighlightForFeature(feature, cat);

  if (layerId === "mooring_stacks-layer") {
    const members = parseColocatedMembersFromAttrs(attrs);
    if (members.length >= 2) {
      const pages = pagesFromStackMembers(members, attrs);
      if (pages.length <= 1) {
        const only = members[0]!;
        showMapPopupPages({
          map,
          lngLat: anchor,
          pages: [
            {
              title: platformInspectTitleForLayer(only.layer_id, attrs),
              html: buildPlatformInspectPopupHtml(only.layer_id, {
                ...attrs,
                ptf_ref: only.ptf_ref,
              }),
            },
          ],
          ...popupOpts,
          ...stackHighlight,
        });
        return;
      }
      showMapPopupPages({
        map,
        lngLat: anchor,
        pages,
        ...popupOpts,
        ...stackHighlight,
      });
      return;
    }
    if (members.length === 1) {
      const only = members[0]!;
      showMapPopupPages({
        map,
        lngLat: anchor,
        pages: [
          {
            title: platformInspectTitleForLayer(only.layer_id, attrs),
            html: buildPlatformInspectPopupHtml(only.layer_id, attrs),
          },
        ],
        ...popupOpts,
        ...stackHighlight,
      });
      return;
    }
    showMapPopupPages({
      map,
      lngLat: anchor,
      pages: [
        {
          title: stackInspectPopupTitle(
            Number(attrs.stack_mask ?? 0),
            String(attrs.ptf_ref ?? ""),
            attrs
          ),
          html: buildPlatformInspectPopupHtml("moored_buoys", attrs),
        },
      ],
      ...popupOpts,
      ...stackHighlight,
    });
    return;
  }

  if (!cat) return;

  if (cat.type === "line") {
    const title = linePopupTitleForCategory(cat, attrs);
    const html = await buildLinePopupHtmlForCategory(cat, attrs);
    showMapPopupPages({
      map,
      lngLat: anchor,
      pages: [{ title, html }],
      ...popupOpts,
      ...platformHighlight,
    });
    return;
  }

  const title = platformInspectTitleForLayer(cat.id, attrs);
  const html = buildPlatformInspectPopupHtml(cat.id, attrs);
  showMapPopupPages({
    map,
    lngLat: anchor,
    pages: [{ title, html }],
    ...popupOpts,
    ...platformHighlight,
  });
}

function hitDedupeKey(layerId: string, feature: GeoJSON.Feature): string {
  const props = propsFromFeature(feature);
  const ref = String(props.ptf_ref ?? "").trim();
  const id = feature.id ?? props.ptf_id ?? "";
  return `${layerId}:${ref}:${id}`;
}

function collectHitsFromRendered(
  rendered: maplibregl.MapGeoJSONFeature[]
): Array<{ feature: GeoJSON.Feature; layerId: string }> {
  const out: Array<{ feature: GeoJSON.Feature; layerId: string }> = [];
  const seen = new Set<string>();
  for (const f of rendered) {
    const layerId = f.layer?.id;
    if (!layerId) continue;
    const feature = f as unknown as GeoJSON.Feature;
    const key = hitDedupeKey(layerId, feature);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ feature, layerId });
  }
  return out;
}

function pickFeaturesAtClick(
  map: maplibregl.Map,
  point: maplibregl.Point
): Array<{ feature: GeoJSON.Feature; layerId: string }> {
  const layers = interactiveLayerIds().filter((id) => map.getLayer(id));
  const zoom = map.getZoom();
  const r =
    zoom < COLOCATED_PICK_MAX_ZOOM ? COLOCATED_PICK_BOX_PX : COLOCATED_PICK_MIN_PX;
  const rendered =
    r > 0
      ? map.queryRenderedFeatures(
          [
            [point.x - r, point.y - r],
            [point.x + r, point.y + r],
          ],
          { layers }
        )
      : map.queryRenderedFeatures(point, { layers });
  return collectHitsFromRendered(rendered);
}

export function bindMapInteractions(map: maplibregl.Map): void {
  map.on("mousemove", (e) => {
    const hits = pickFeaturesAtClick(map, e.point);
    map.getCanvas().style.cursor = hits.length ? "pointer" : "";
  });

  map.on("click", (e) => {
    const hits = pickFeaturesAtClick(map, e.point);
    if (hits.length === 0) {
      closeMapPopup();
      return;
    }

    const lineHit = hits.find((h) => {
      const cat = categoryForLayerId(h.layerId);
      return cat?.type === "line";
    });
    if (lineHit) {
      void popupForFeature(map, lineHit.feature, lineHit.layerId, e.lngLat);
      return;
    }

    const pointHits = hits.filter((h) => {
      const catId = categoryIdFromMapLayer(h.layerId);
      return catId && isColocatedPopupLayer(catId);
    });

    const members = uniquePlatformMembers(
      pointHits.map((h) =>
        memberFromPlatformAttributes(
          categoryIdFromMapLayer(h.layerId)!,
          propsFromFeature(h.feature)
        )
      )
    );
    if (
      members.length >= 2 &&
      colocatedHitsOverlapOnScreen(map, pointHits, e.lngLat)
    ) {
      const pages = pagesFromColocatedHits(pointHits);
      if (pages.length >= 2) {
        const lead = pointHits[0]!;
        const anchor = featureAnchorLngLat(lead.feature, e.lngLat);
        showMapPopupPages({
          map,
          lngLat: anchor,
          pages,
          ...selectionHighlightForFeature(
            lead.feature,
            categoryForLayerId(lead.layerId)
          ),
        });
        return;
      }
    }

    const top = pointHits[0] ?? hits[0];
    if (!top) {
      closeMapPopup();
      return;
    }
    void popupForFeature(
      map,
      top.feature,
      top.layerId,
      featureAnchorLngLat(top.feature, e.lngLat)
    );
  });
}
