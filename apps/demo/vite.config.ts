import { designOverlayApiPlugin } from "@i2-labs/design-overlay/vite";
import { findWorkspacePackagesNoCheck } from "@pnpm/find-workspace-packages";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");

// https://vite.dev/config/
export default defineConfig(async () => {
  const workspacePackages = await findWorkspacePackagesNoCheck(workspaceRoot);
  const selfDir = path.resolve(__dirname);
  const workspacePackageNames = workspacePackages
    .filter((p) => path.resolve(p.dir) !== selfDir)
    .map((p) => p.manifest.name)
    .filter((name): name is string => typeof name === "string");

  return {
    resolve: {
      // use-sync-external-store/shim is CJS (default export only); deps use named import.
      // React 18+ has useSyncExternalStore. Alias only the base shim (exact match) so
      // use-sync-external-store/shim/with-selector.js still resolves to the real package.
      alias: [
        {
          find: /^use-sync-external-store\/shim$/,
          replacement: "react",
        },
      ],
    },
    plugins: [
      tsConfigPaths(),
      tanstackStart({
        prerender: { enabled: true },
        sitemap: { enabled: true, host: "https://ishchhabra.github.io" },
      }),
      react(),
      tailwindcss(),
      designOverlayApiPlugin(),
    ],
    optimizeDeps: {
      // Injected workspace packages are still in node_modules (copy), so Vite
      // would pre-bundle them. Exclude so we use their built dist (pnpm-sync)
      // and see package changes without restarting dev. See: vite.dev/guide/dep-pre-bundling
      exclude: workspacePackageNames,
    },
    // Bundle workspace packages in SSR so Node doesn't have to resolve their
    // extensionless ESM imports (tsc emits "./Overlay" not "./Overlay.js").
    // TODO: Prefer fixing at package level with tsconfig "rewriteRelativeImportExtensions"
    // (TS 5.7+) and .ts/.tsx in source imports so dist is Node ESM-ready; then remove noExternal.
    ssr: {
      noExternal: workspacePackageNames,
    },
  };
});
