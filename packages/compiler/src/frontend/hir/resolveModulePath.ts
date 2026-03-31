import { existsSync, readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join, resolve } from "path";

/**
 * Resolves an import path to an absolute file path, preferring ESM entry points.
 *
 * Strategy: use require.resolve() to locate the package, then try to find
 * the ESM entry via package.json `exports` → `module` field → .mjs sibling.
 */
export function resolveModulePath(importPath: string, fromPath: string): string {
  try {
    const req = createRequire(fromPath);
    const resolved = req.resolve(importPath);

    // For bare specifiers, try to find a better ESM entry from package.json
    if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
      const esmEntry = resolveEsmEntry(importPath, resolved);
      if (esmEntry) {
        return esmEntry;
      }
    }

    // Check for .mjs sibling (e.g. dist/index.js → dist/index.mjs)
    const mjsSibling = resolved.replace(/\.js$/, ".mjs");
    if (mjsSibling !== resolved && existsSync(mjsSibling)) {
      return mjsSibling;
    }

    return resolved;
  } catch {
    return importPath;
  }
}

/**
 * Reads the package's package.json and looks for the ESM entry point via
 * the `exports["."].import` condition or the `module` field.
 */
function resolveEsmEntry(specifier: string, cjsResolved: string): string | undefined {
  const packageJsonPath = findPackageJson(cjsResolved);
  if (!packageJsonPath) {
    return undefined;
  }

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  } catch {
    return undefined;
  }

  const packageDir = dirname(packageJsonPath);
  const packageName = getPackageName(specifier);

  // Only handle the main entry (".") — subpath exports are rare and complex.
  if (specifier !== packageName) {
    return undefined;
  }

  // Try exports["."].import
  const esmPath = getExportsImportEntry(pkg["exports"]);
  if (esmPath) {
    const resolved = resolve(packageDir, esmPath);
    if (existsSync(resolved)) {
      return resolved;
    }
  }

  // Fall back to `module` field
  if (typeof pkg["module"] === "string") {
    const resolved = resolve(packageDir, pkg["module"] as string);
    if (existsSync(resolved)) {
      return resolved;
    }
  }

  return undefined;
}

/**
 * Extracts the `import` condition string from a package.json `exports` field.
 * Handles common layouts:
 *   exports: "./dist/index.mjs"
 *   exports: { ".": { import: "./dist/index.mjs" } }
 *   exports: { ".": { import: { default: "./dist/index.mjs" } } }
 *   exports: { import: "./dist/index.mjs" }   (no subpath keys)
 */
function getExportsImportEntry(exports: unknown): string | undefined {
  if (typeof exports === "string") {
    return exports;
  }
  if (!exports || typeof exports !== "object" || Array.isArray(exports)) {
    return undefined;
  }

  const exp = exports as Record<string, unknown>;

  // Determine whether this is a conditions map or a subpath map.
  // Subpath maps have keys starting with ".".
  const target = "." in exp ? exp["."] : exp;

  return resolveCondition(target);
}

function resolveCondition(target: unknown): string | undefined {
  if (typeof target === "string") {
    return target;
  }
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    return undefined;
  }

  const obj = target as Record<string, unknown>;
  for (const key of ["import", "browser", "default"]) {
    const value = obj[key];
    if (typeof value === "string") {
      return value;
    }
    // Handle one level of nesting: { import: { types: ..., default: "..." } }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = (value as Record<string, unknown>)["default"];
      if (typeof nested === "string") {
        return nested;
      }
    }
  }

  return undefined;
}

function findPackageJson(fromPath: string): string | undefined {
  let dir = dirname(fromPath);
  while (dir !== dirname(dir)) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      return candidate;
    }
    dir = dirname(dir);
  }
  return undefined;
}

function getPackageName(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}
