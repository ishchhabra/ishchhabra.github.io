import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compilerVitePlugin } from "@i2-labs/compiler/vite";
import { findWorkspacePackagesNoCheck } from "@pnpm/find-workspace-packages";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import type { Nitro } from "nitro/types";
import { nitro } from "nitro/vite";
import { type UserConfig, defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");
const compilerAot = process.env["ENABLE_COMPILER_AOT"] === "1";

// https://vite.dev/config/
export default defineConfig(async (): Promise<UserConfig> => {
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
      ...(compilerAot
        ? [
            compilerVitePlugin({
              rootDir: __dirname,
              include: ["src"],
            }),
          ]
        : []),
      tanstackStart({
        srcDirectory: "src",
        prerender: { enabled: process.env["NITRO_PRESET"] !== "vercel" },
        sitemap: {
          enabled: process.env["NITRO_PRESET"] !== "vercel",
          host: process.env["VITE_SITE_URL"] as string,
        },
      }),
      nitro({
        routeRules: {
          "/ingest/static/**": { proxy: "https://us-assets.i.posthog.com/static/**" },
          "/ingest/**": { proxy: "https://us.i.posthog.com/**" },
        },
        // oxc-parser's `src-js/index.js` has `export { default as X } from "./..."`
        // re-exports that trip a rollup bug (`Cannot read properties of null` in
        // `getVariableForExportName`) when it enters the module graph. Marking
        // it external at the rollup level sidesteps the crash, but that also
        // bypasses nitro's externals tracer — so we copy oxc-parser into the
        // function's node_modules ourselves. Same pattern Nuxt uses internally.
        // Drop this once upstream fixes land.
        //
        // Note: register via `modules` (not `hooks.compiled`) so we append to
        // Nitro's hookable rather than replacing the preset's own `compiled`
        // hook (the vercel preset uses it to emit `.vercel/output/config.json`).
        rollupConfig: {
          external: ["oxc-parser", "@oxc-parser/core"],
        },
        modules: [
          (nitro: Nitro) => {
            nitro.hooks.hook("compiled", async () => {
              const { traceNodeModules } = await import("nf3");
              const req = createRequire(path.join(__dirname, "package.json"));
              await traceNodeModules([req.resolve("oxc-parser")], {
                rootDir: nitro.options.rootDir,
                outDir: nitro.options.output.serverDir,
                writePackageJson: true,
                conditions: nitro.options.exportConditions || ["default"],
              });
            });
          },
        ],
        ...(process.env["VERCEL"] === "1" && {
          output: {
            dir: path.resolve(__dirname, ".vercel/output"),
            publicDir: path.resolve(__dirname, ".vercel/output/static"),
          },
        }),
      }),
      react({
        babel: {
          plugins: [["babel-plugin-react-compiler", { target: "19" }]],
        },
      }),
      tailwindcss(),
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
    // TanStack Start virtual modules and server-only Node modules are not available
    // in the worker build context. Externalize them so the worker bundle doesn't fail.
    worker: {
      format: "es",
      rollupOptions: {
        external: [
          /^tanstack-start-manifest:/,
          /^tanstack-start-injected-head-scripts:/,
          /^@tanstack\/react-start/,
          /^@tanstack\/start-/,
          "node:async_hooks",
          "node:stream",
          "node:stream/web",
        ],
      },
    },
  };
});
