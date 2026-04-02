import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileProjectDetailed } from "../../../packages/compiler/dist/compileProject.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portfolioRoot = path.resolve(__dirname, "..");

const includeNodeModules = process.env["AOT_NODE_MODULES"] === "1";
const nodeModulesOutDir = path.join(portfolioRoot, ".aot-node-modules");
const nodeModulesManifestPath = path.join(portfolioRoot, ".aot-node-modules-manifest.json");

// Keep plain AOT builds isolated from a previous node-modules run.
rmSync(nodeModulesManifestPath, { force: true });
if (!includeNodeModules) {
  rmSync(nodeModulesOutDir, { force: true, recursive: true });
}

const result = compileProjectDetailed({
  srcDir: path.join(portfolioRoot, "src"),
  outDir: path.join(portfolioRoot, ".aot-src"),
  includeNodeModules,
  nodeModulesOutDir: includeNodeModules ? nodeModulesOutDir : undefined,
  // shiki.ts: capture pruning drops the langAliases module-level binding
  // after inlining resolveLang into highlightCode, leaving a dangling ref.
  exclude: [/lib\/shiki\.ts$/],
});

let compiled = 0;
let copied = 0;
let skipped = 0;
for (const fileResult of result.files) {
  if (fileResult.status === "compiled") {
    compiled++;
    console.log(`✓ ${fileResult.file}`);
  } else if (fileResult.status === "copied") {
    copied++;
    console.log(`→ ${fileResult.file} (copied)`);
  } else {
    skipped++;
    console.log(`✗ ${fileResult.file}: ${fileResult.error}`);
  }
}
console.log(`\nDone: ${compiled} compiled, ${copied} copied, ${skipped} skipped`);

if (includeNodeModules) {
  console.log(
    `\nNode modules: ${result.compiledNodeModulePackages.length} compiled, ${result.opaqueNodeModulePackages.length} opaque`,
  );
  console.log(`Mirrored packages: ${result.nodeModuleMirrors.length}`);

  // Packages excluded from mirroring due to WASM issues or compiler codegen
  // bugs (duplicate identifiers in generated output).
  const DENY_LIST = [
    "shiki",
    "@shikijs/",
    "clsx",
    "zod",
    "better-call",
    "micromark-core-commonmark",
    // capture pruning drops inlined function captures
    "@vercel/speed-insights",
    // @radix-ui compound components trigger a duplicate-identifier codegen bug
    "@radix-ui/react-accordion",
    "@radix-ui/react-alert-dialog",
    "@radix-ui/react-avatar",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-collapsible",
    "@radix-ui/react-context-menu",
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-form",
    "@radix-ui/react-hover-card",
    "@radix-ui/react-menu",
    "@radix-ui/react-menubar",
    "@radix-ui/react-one-time-password-field",
    "@radix-ui/react-password-toggle-field",
    "@radix-ui/react-popover",
    "@radix-ui/react-progress",
    "@radix-ui/react-roving-focus",
    "@radix-ui/react-slider",
    "@radix-ui/react-tabs",
    "@radix-ui/react-toast",
    "@radix-ui/react-toggle-group",
    "@radix-ui/react-toolbar",
    "@radix-ui/react-tooltip",
  ];

  const mirrors = result.nodeModuleMirrors.filter((m) => {
    const isDenied = DENY_LIST.some((p) => m.packageRoot.includes(`/${p}`));
    if (isDenied) {
      rmSync(m.mirrorRoot, { force: true, recursive: true });
    }
    return !isDenied;
  });

  writeFileSync(nodeModulesManifestPath, JSON.stringify({ mirrors }, null, 2));
  console.log(`Manifest written: ${mirrors.length} mirrors`);
}

// Copy non-JS assets and .d.ts files that the compiler doesn't emit.
const srcRoot = path.join(portfolioRoot, "src");
const destRoot = path.join(portfolioRoot, ".aot-src");

const EXTRA_EXT = new Set([
  ".css",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
]);

function walkFiles(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walkFiles(p));
    } else {
      out.push(p);
    }
  }
  return out;
}

for (const abs of walkFiles(srcRoot)) {
  const ext = path.extname(abs);
  const copyDecl = abs.endsWith(".d.ts");
  if (!copyDecl && !EXTRA_EXT.has(ext)) {
    continue;
  }
  const rel = path.relative(srcRoot, abs);
  const dest = path.join(destRoot, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(abs, dest);
}
