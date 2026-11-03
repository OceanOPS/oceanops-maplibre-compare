import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const simpleMapPublic = path.resolve(root, "../oceanops-simple-map/public");

/** Reuse GeoJSON + icons from oceanops-simple-map (no duplicate export). */
export default defineConfig({
  publicDir: simpleMapPublic,
  resolve: {
    alias: {
      "@arcgis/core/PopupTemplate.js": path.resolve(root, "src/stubs/arcgis-core.ts"),
      "@arcgis/core/Graphic.js": path.resolve(root, "src/stubs/arcgis-core.ts"),
      "@arcgis/core/popup/content/CustomContent.js": path.resolve(
        root,
        "src/stubs/arcgis-core.ts"
      ),
      "@arcgis/core/views/MapView.js": path.resolve(root, "src/stubs/arcgis-core.ts"),
      "@arcgis/core/views/SceneView.js": path.resolve(root, "src/stubs/arcgis-core.ts"),
    },
  },
  server: {
    port: 5175,
    strictPort: true,
  },
});
