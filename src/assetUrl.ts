/** Resolve public asset paths (GeoJSON, /img, /icons) with Vite base URL. */
export function assetUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
  if (path.startsWith("/")) return `${base.replace(/\/$/, "")}${path}`;
  return `${base}${path}`;
}

/** Stable MapLibre sprite id from a public asset path. */
export function iconIdFromAssetPath(path: string): string {
  return path
    .replace(/^\/+/, "")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
