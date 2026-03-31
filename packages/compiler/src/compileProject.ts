import {
  rmSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  statSync,
} from "fs";
import { resolve, join, dirname, relative } from "path";
import { CompilerOptions, CompilerOptionsSchema } from "./compile";
import { CodeGenerator } from "./backend/CodeGenerator";
import { ProjectBuilder, getNodeModulePackageRoot } from "./frontend/ProjectBuilder";
import { Pipeline } from "./pipeline/Pipeline";
import { glob } from "glob";

export interface ProjectCompilerOptions extends CompilerOptions {
  srcDir: string;
  outDir: string;
  exclude?: RegExp[];
  excludeContentPatterns?: string[];
  includeNodeModules?: boolean;
  nodeModulesOutDir?: string;
}

export interface FileResult {
  file: string;
  status: "compiled" | "copied" | "skipped";
  error?: string;
}

export interface NodeModuleMirror {
  packageRoot: string;
  mirrorRoot: string;
}

export interface DetailedCompileResult {
  files: FileResult[];
  compiledNodeModulePackages: string[];
  opaqueNodeModulePackages: string[];
  nodeModuleMirrors: NodeModuleMirror[];
}

export function compileProject(options: ProjectCompilerOptions): FileResult[] {
  return compileProjectDetailed(options).files;
}

export function compileProjectDetailed(options: ProjectCompilerOptions): DetailedCompileResult {
  const {
    srcDir,
    outDir,
    exclude = [],
    excludeContentPatterns = [],
    includeNodeModules = false,
    nodeModulesOutDir,
    ...compilerOptions
  } = options;

  const resolvedSrc = resolve(srcDir);
  const resolvedOut = resolve(outDir);
  const resolvedNodeModulesOut = nodeModulesOutDir ? resolve(nodeModulesOutDir) : undefined;

  if (resolvedNodeModulesOut !== undefined) {
    rmSync(resolvedNodeModulesOut, { force: true, recursive: true });
  }

  const files = glob.sync("**/*.{ts,tsx,js,jsx}", {
    cwd: resolvedSrc,
    ignore: ["**/*.d.ts"],
  });

  // Partition files into compilable entries vs excluded/copied
  const entryFiles: string[] = [];
  const copiedFiles: string[] = [];

  for (const file of files) {
    if (exclude.some((pattern) => pattern.test(file))) {
      copiedFiles.push(file);
      continue;
    }

    const content = readFileSync(join(resolvedSrc, file), "utf-8");
    if (excludeContentPatterns.some((pattern) => content.includes(pattern))) {
      copiedFiles.push(file);
      continue;
    }

    entryFiles.push(file);
  }

  const results: FileResult[] = [];

  // Copy excluded files as-is
  for (const file of copiedFiles) {
    const absOutput = join(resolvedOut, file);
    mkdirSync(dirname(absOutput), { recursive: true });
    writeFileSync(absOutput, readFileSync(join(resolvedSrc, file)));
    results.push({ file, status: "copied" });
  }

  // Build the entire project as a single unit
  const projectBuilder = new ProjectBuilder({ includeNodeModules });
  const builtFiles: string[] = [];
  for (const file of entryFiles) {
    try {
      projectBuilder.build(join(resolvedSrc, file));
      builtFiles.push(file);
    } catch (err: unknown) {
      // If a file fails to parse, copy it as-is
      const absOutput = join(resolvedOut, file);
      mkdirSync(dirname(absOutput), { recursive: true });
      writeFileSync(absOutput, readFileSync(join(resolvedSrc, file)));
      results.push({
        file,
        status: "skipped",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const entryPaths = builtFiles.map((f) => join(resolvedSrc, f));
  const projectUnit = projectBuilder.getProjectUnit(entryPaths);

  // Determine root entries: source files not imported by any other source file
  const allSourcePaths = new Set(entryPaths);
  const importedSourcePaths = new Set<string>();
  for (const [, moduleIR] of projectUnit.modules) {
    for (const global of moduleIR.globals.values()) {
      if (global.kind === "import" && allSourcePaths.has(global.source)) {
        importedSourcePaths.add(global.source);
      }
    }
  }
  const rootEntryPaths = [...allSourcePaths].filter((p) => !importedSourcePaths.has(p));

  // Run the pipeline once on the entire project
  const parsedOptions = CompilerOptionsSchema.parse(compilerOptions);
  try {
    new Pipeline(projectUnit, parsedOptions, rootEntryPaths).run();
  } catch (err: unknown) {
    // If pipeline fails, copy all entry files as-is
    for (const file of builtFiles) {
      const absOutput = join(resolvedOut, file);
      mkdirSync(dirname(absOutput), { recursive: true });
      writeFileSync(absOutput, readFileSync(join(resolvedSrc, file)));
      results.push({
        file,
        status: "skipped",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return {
      files: results,
      compiledNodeModulePackages: projectUnit.compiledNodeModulePackages,
      opaqueNodeModulePackages: projectUnit.opaqueNodeModulePackages,
      nodeModuleMirrors: [],
    };
  }

  // Generate code for each source module
  const generator = new CodeGenerator("", projectUnit);
  for (const file of entryFiles) {
    const absInput = join(resolvedSrc, file);
    const absOutput = join(resolvedOut, file);
    mkdirSync(dirname(absOutput), { recursive: true });

    try {
      const code = generator.generateModule(absInput);
      writeFileSync(absOutput, code);
      results.push({ file, status: "compiled" });
    } catch (err: unknown) {
      writeFileSync(absOutput, readFileSync(absInput));
      results.push({
        file,
        status: "skipped",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const nodeModuleMirrors =
    includeNodeModules && resolvedNodeModulesOut !== undefined
      ? emitCompiledNodeModules(projectUnit, resolvedNodeModulesOut)
      : [];

  return {
    files: results,
    compiledNodeModulePackages: projectUnit.compiledNodeModulePackages,
    opaqueNodeModulePackages: projectUnit.opaqueNodeModulePackages,
    nodeModuleMirrors,
  };
}

/**
 * Emits compiled node_module files into a mirror directory.
 *
 * For each compiled package: copies the full package tree (so relative imports
 * still resolve), then overwrites compiled files with optimized output.
 */
function emitCompiledNodeModules(
  projectUnit: ReturnType<ProjectBuilder["getProjectUnit"]>,
  nodeModulesOutDir: string,
): NodeModuleMirror[] {
  const generator = new CodeGenerator("", projectUnit);

  // Group compiled modules by their package root
  const modulesByPackage = new Map<string, string[]>();
  for (const modulePath of projectUnit.modules.keys()) {
    const packageRoot = getNodeModulePackageRoot(modulePath);
    if (packageRoot === undefined) continue;
    const list = modulesByPackage.get(packageRoot) ?? [];
    list.push(modulePath);
    modulesByPackage.set(packageRoot, list);
  }

  const mirrors: NodeModuleMirror[] = [];

  for (const packageRoot of projectUnit.compiledNodeModulePackages.slice().sort()) {
    const mirrorRoot = getMirrorPackageRoot(packageRoot, nodeModulesOutDir);

    // Copy the full package tree so non-compiled files stay intact
    try {
      copyPackageTree(packageRoot, mirrorRoot);
    } catch {
      rmSync(mirrorRoot, { force: true, recursive: true });
      continue;
    }

    // Overwrite compiled files with optimized output
    let wrote = false;
    for (const modulePath of modulesByPackage.get(packageRoot) ?? []) {
      const outputPath = join(mirrorRoot, relative(packageRoot, modulePath));
      try {
        const code = generator.generateModule(modulePath);
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, code);
        wrote = true;
      } catch {
        // Generation failed for this file — the original copy remains
      }
    }

    if (wrote) {
      mirrors.push({ packageRoot, mirrorRoot });
    } else {
      rmSync(mirrorRoot, { force: true, recursive: true });
    }
  }

  return mirrors;
}

function copyPackageTree(sourceDir: string, destinationDir: string): void {
  mkdirSync(destinationDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const sourcePath = join(sourceDir, entry.name);
    const destinationPath = join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      copyPackageTree(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      mkdirSync(dirname(destinationPath), { recursive: true });
      copyFileSync(sourcePath, destinationPath);
    } else if (entry.isSymbolicLink()) {
      const stats = statSync(sourcePath);
      if (stats.isDirectory()) {
        copyPackageTree(sourcePath, destinationPath);
      } else if (stats.isFile()) {
        mkdirSync(dirname(destinationPath), { recursive: true });
        copyFileSync(sourcePath, destinationPath);
      }
    }
  }
}

function getMirrorPackageRoot(packageRoot: string, nodeModulesOutDir: string): string {
  // Find the top-level node_modules to compute a relative mirror path
  const normalized = packageRoot.replace(/\\/g, "/");
  const segments = normalized.split("/");
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === "node_modules") {
      const topLevel = segments.slice(0, i + 1).join("/");
      return join(nodeModulesOutDir, relative(topLevel, packageRoot));
    }
  }
  return join(nodeModulesOutDir, packageRoot.replace(/[:/\\]+/g, "__"));
}
