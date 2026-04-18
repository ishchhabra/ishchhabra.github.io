import { findWorkspacePackagesNoCheck } from "@pnpm/find-workspace-packages";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import type { Nitro } from "nitro/types";
import { nitro } from "nitro/vite";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Plugin, type UserConfig, defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");
const portfolioAot = process.env["ENABLE_AOT"] === "1";
const effectiveSrcDir = portfolioAot ? ".aot-src" : "src";

interface MirrorEntry {
  packageRoot: string;
  mirrorRoot: string;
}

function loadNodeModuleMirrors(): MirrorEntry[] {
  const manifestPath = path.resolve(__dirname, ".aot-node-modules-manifest.json");
  if (!existsSync(manifestPath)) {
    return [];
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    return manifest.mirrors ?? [];
  } catch {
    return [];
  }
}

/**
 * Vite plugin that redirects resolved node_module paths to their AOT-compiled
 * mirror copies. Works by first letting Vite resolve imports normally, then
 * checking if the resolved path falls within a compiled package root.
 */
function aotNodeModulesPlugin(mirrors: MirrorEntry[]): Plugin {
  if (mirrors.length === 0) {
    return { name: "aot-node-modules" };
  }

  // Sort longest-first so nested packages match before parents.
  const sorted = mirrors.slice().sort((a, b) => b.packageRoot.length - a.packageRoot.length);

  // Build reverse map: mirrorRoot → packageRoot (for fixing imports from mirrors)
  const reverseSorted = mirrors.slice().sort((a, b) => b.mirrorRoot.length - a.mirrorRoot.length);

  function findOriginalImporter(importer: string): string | undefined {
    for (const { packageRoot, mirrorRoot } of reverseSorted) {
      if (importer.startsWith(mirrorRoot + "/") || importer === mirrorRoot) {
        return packageRoot + importer.slice(mirrorRoot.length);
      }
    }
    return undefined;
  }

  const resolving = new Set<string>();

  return {
    name: "aot-node-modules",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    async resolveId(source, importer, options) {
      // Prevent infinite recursion: skip if we're already resolving this pair.
      const key = `${source}\0${importer ?? ""}`;
      if (resolving.has(key)) return null;

      // If the importer is inside a mirror directory and the source is a bare
      // specifier, resolve as if importing from the original package location
      // so that node_modules resolution works correctly.
      let effectiveImporter = importer;
      if (importer) {
        const original = findOriginalImporter(importer);
        if (original) {
          effectiveImporter = original;
        }
      }

      resolving.add(key);
      let resolved;
      try {
        resolved = await this.resolve(source, effectiveImporter, options);
      } finally {
        resolving.delete(key);
      }
      if (!resolved || resolved.external) return null;

      const id = resolved.id;
      for (const { packageRoot, mirrorRoot } of sorted) {
        if (id.startsWith(packageRoot + "/") || id === packageRoot) {
          const mirrored = mirrorRoot + id.slice(packageRoot.length);
          if (existsSync(mirrored)) {
            return { id: mirrored, moduleSideEffects: resolved.moduleSideEffects };
          }
        }
      }

      // If the importer was remapped from a mirror, we must return the
      // resolved id explicitly so Rollup doesn't try to resolve from
      // the mirror directory (where node_modules doesn't exist).
      if (importer && findOriginalImporter(importer)) {
        return { id: resolved.id, moduleSideEffects: resolved.moduleSideEffects };
      }

      return null;
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async (): Promise<UserConfig> => {
  const workspacePackages = await findWorkspacePackagesNoCheck(workspaceRoot);
  const selfDir = path.resolve(__dirname);
  const workspacePackageNames = workspacePackages
    .filter((p) => path.resolve(p.dir) !== selfDir)
    .map((p) => p.manifest.name)
    .filter((name): name is string => typeof name === "string");

  const mirrors = portfolioAot ? loadNodeModuleMirrors() : [];

  return {
    resolve: {
      // use-sync-external-store/shim is CJS (default export only); deps use named import.
      // React 18+ has useSyncExternalStore. Alias only the base shim (exact match) so
      // use-sync-external-store/shim/with-selector.js still resolves to the real package.
      alias: [
        ...(portfolioAot
          ? [
              {
                find: path.resolve(__dirname, "src"),
                replacement: path.resolve(__dirname, ".aot-src"),
              },
            ]
          : []),
        {
          find: /^use-sync-external-store\/shim$/,
          replacement: "react",
        },
      ],
    },
    plugins: [
      tsConfigPaths(),
      ...(mirrors.length > 0 ? [aotNodeModulesPlugin(mirrors)] : []),
      tanstackStart({
        srcDirectory: effectiveSrcDir,
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
