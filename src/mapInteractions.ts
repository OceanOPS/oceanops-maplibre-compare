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
import { closeMapPopup, showMapPopupPages, type MapPopupPage } from "./popupHost";

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

function pagesFromColocatedMembers(
  members: ColocatedPlatformMember[],
  attrsByLayer: Map<string, Record<string, unknown>>
): MapPopupPage[] {
  return members.map((member) => {
    const attrs = attrsByLayer.get(member.layer_id) ?? {};
    return {
      title: memberPageTitle(member, attrs),
      html: buildPlatformInspectPopupHtml(member.layer_id, {
        ...attrs,
        ptf_ref: member.ptf_ref,
      }),
    };
  });
}

export type OpenFeaturePopupOptions = {
  focusOnOpen?: boolean;
};

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

  if (layerId === "mooring_stacks-layer") {
    const members = parseColocatedMembersFromAttrs(attrs);
    if (members.length >= 2) {
      showMapPopupPages({
        map,
        lngLat: anchor,
        pages: pagesFromStackMembers(members, attrs),
        ...popupOpts,
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
  });
}

function collectHitsFromRendered(
  rendered: maplibregl.MapGeoJSONFeature[]
): Array<{ feature: GeoJSON.Feature; layerId: string }> {
  const out: Array<{ feature: GeoJSON.Feature; layerId: string }> = [];
  const seen = new Set<string>();
  for (const f of rendered) {
    const layerId = f.layer?.id;
    if (!layerId || seen.has(layerId)) continue;
    seen.add(layerId);
    out.push({ feature: f as unknown as GeoJSON.Feature, layerId });
  }
  return out;
}

/** Point-only pick for clicks — icons/markers/lines under the cursor, not nearby geometry. */
function pickFeaturesAtClick(
  map: maplibregl.Map,
  point: maplibregl.Point
): Array<{ feature: GeoJSON.Feature; layerId: string }> {
  const layers = interactiveLayerIds().filter((id) => map.getLayer(id));
  const rendered = map.queryRenderedFeatures(point, { layers });
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

    if (pointHits.length >= 2) {
      const members = pointHits.map((h) =>
        memberFromPlatformAttributes(
          categoryIdFromMapLayer(h.layerId)!,
          propsFromFeature(h.feature)
        )
      );
      const attrsByLayer = new Map<string, Record<string, unknown>>();
      for (const h of pointHits) {
        const id = categoryIdFromMapLayer(h.layerId)!;
        attrsByLayer.set(id, propsFromFeature(h.feature));
      }
      const anchor = featureAnchorLngLat(pointHits[0]!.feature, e.lngLat);
      showMapPopupPages({
        map,
        lngLat: anchor,
        pages: pagesFromColocatedMembers(members, attrsByLayer),
      });
      return;
    }

    const top = pointHits[0] ?? hits[0]!;
    const anchor = featureAnchorLngLat(top.feature, e.lngLat);
    void popupForFeature(map, top.feature, top.layerId, anchor);
  });
}
