import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileProject } from "../../../packages/compiler/dist/compileProject.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portfolioRoot = path.resolve(__dirname, "..");

const results = compileProject({
  srcDir: path.join(portfolioRoot, "src"),
  outDir: path.join(portfolioRoot, ".aot-src"),
});

let compiled = 0;
let copied = 0;
let skipped = 0;
for (const result of results) {
  if (result.status === "compiled") {
    compiled++;
    console.log(`✓ ${result.file}`);
  } else if (result.status === "copied") {
    copied++;
    console.log(`→ ${result.file} (copied)`);
  } else {
    skipped++;
    console.log(`✗ ${result.file}: ${result.error}`);
  }
}
console.log(`\nDone: ${compiled} compiled, ${copied} copied, ${skipped} skipped`);

const srcRoot = path.join(portfolioRoot, "src");
const destRoot = path.join(portfolioRoot, ".aot-src");

/** Files the AOT project step does not emit (see packages/compiler compileProject glob). */
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
