import tsConfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

// Modules that crash when imported in Node outside the full Vite bundler.
const STUB_MODULES = ["@scelar/nodepod"];

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    {
      name: "stub-non-essentials",
      enforce: "pre",
      resolveId(id) {
        if (/\.(css|scss|less|sass|styl|stylus|postcss)(\?.*)?$/.test(id)) {
          return "\0stub";
        }
        if (STUB_MODULES.includes(id)) {
          return "\0stub";
        }
      },
      load(id) {
        if (id === "\0stub") return "export default {}";
      },
    },
  ],
  envPrefix: "VITE_",
  ssr: { noExternal: STUB_MODULES },
  optimizeDeps: { noDiscovery: true },
});
