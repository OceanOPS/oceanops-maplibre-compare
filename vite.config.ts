import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  publicDir: path.resolve(root, "public"),
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
