# oceanops-maplibre-compare

MapLibre GL JS port of **[oceanops-simple-map](https://github.com/OceanOPS/oceanops-simple-map)** for side-by-side comparison (Esri vs MapLibre).

## Development

Requires **oceanops-simple-map** cloned as a sibling directory (GeoJSON, icons, and images are served from `../oceanops-simple-map/public` via Vite `publicDir`).

```bash
npm install
npm run dev
```

Dev server: **http://localhost:5175**

## Build

```bash
npm run build
npm run preview
```

## Data

Layer GeoJSON and static assets are **not duplicated** in this repo; they come from `oceanops-simple-map/public`. Regenerate layers with [oceanops-data-exports](https://github.com/OceanOPS/oceanops-data-exports) in the simple-map repo (`npm run export:geojson`).

Partner country breakdown JSON is bundled under `src/oceanops/data/partnerCountries.json` (same source as simple-map).
