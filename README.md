# oceanops-maplibre-compare

MapLibre GL JS port of the OceanOPS in situ networks map (Esri reference: [oceanops-simple-map](https://github.com/OceanOPS/oceanops-simple-map)) for side-by-side comparison.

## Development

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

## Netlify

`netlify.toml` runs `npm run build` and publishes `dist`. All static map assets live in this repo under `public/`.

## Data

Layer GeoJSON, ship sprites, network icons, and basemap preview images are vendored under **`public/`** (geojson, img, icons). To refresh layers after an export, run [oceanops-data-exports](https://github.com/OceanOPS/oceanops-data-exports) and copy the generated files into `public/geojson/` (and update `public/geojson/export-metadata.json` if needed).

Partner country breakdown JSON is bundled under `src/oceanops/data/partnerCountries.json`.
