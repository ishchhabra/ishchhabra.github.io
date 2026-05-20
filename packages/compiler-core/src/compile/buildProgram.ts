import { ModuleIRBuilder, type ModuleIRBuildResult } from "../frontend/ModuleIRBuilder";
import { parseModule } from "../frontend/parse/parseModule";
import { IRIdAllocator } from "../ir/core/IRIdAllocator";
import type { ModuleExport } from "../ir/core/ModuleExport";
import type { ModuleImport } from "../ir/core/ModuleImport";
import { Program } from "../ir/core/Program";
import { ProgramModule } from "../ir/core/ProgramModule";
import type { ProgramModuleDependency } from "../ir/core/ProgramModuleDependency";
import type { LoadedModule, ModuleHost, ResolvedModule } from "./ModuleHost";

export interface BuildProgramOptions {
  readonly ids: IRIdAllocator;
  readonly host: ModuleHost;
  readonly entrypoints: readonly string[];
}

export interface ProgramBuildResult {
  readonly program: Program;
  readonly moduleBuilds: ReadonlyMap<ProgramModule, ModuleIRBuildResult>;
}

/**
 * Resolves, loads, lowers, and links modules reachable from entrypoints.
 */
export async function buildProgram(options: BuildProgramOptions): Promise<ProgramBuildResult> {
  const program = new Program();
  const modulesByResolvedId: Map<string, ProgramModule> = new Map();
  const moduleBuilds: Map<ProgramModule, ModuleIRBuildResult> = new Map();
  const expanded: Set<ProgramModule> = new Set();
  const queue: BuildQueueItem[] = options.entrypoints.map((specifier) => ({
    specifier,
    importer: null,
    entrypoint: true,
  }));

  while (queue.length > 0) {
    const item = queue.shift()!;
    const resolved = await options.host.resolve(item.specifier, item.importer);
    const module = await getOrCreateModule(
      program,
      modulesByResolvedId,
      moduleBuilds,
      resolved,
      options,
    );

    if (item.entrypoint && !program.entrypoints.includes(module)) {
      program.addEntrypoint(module);
    }

    if (item.from !== undefined && item.kind !== undefined) {
      program.addDependency({
        kind: item.kind,
        from: item.from,
        to: module,
        specifier: item.specifier,
      });
    }

    const buildResult = moduleBuilds.get(module);
    if (buildResult === undefined || expanded.has(module)) continue;

    expanded.add(module);

    for (const dependency of staticDependencies(buildResult)) {
      queue.push({
        specifier: dependency.specifier,
        importer: module.resolvedId,
        entrypoint: false,
        from: module,
        kind: dependency.kind,
      });
    }
  }

  pruneBuildsWithOpaqueDependencies(program, moduleBuilds);

  return { program, moduleBuilds };
}

interface BuildQueueItem {
  readonly specifier: string;
  readonly importer: string | null;
  readonly entrypoint: boolean;
  readonly from?: ProgramModule;
  readonly kind?: ProgramModuleDependency["kind"];
}

async function getOrCreateModule(
  program: Program,
  modulesByResolvedId: Map<string, ProgramModule>,
  moduleBuilds: Map<ProgramModule, ModuleIRBuildResult>,
  resolved: ResolvedModule,
  options: BuildProgramOptions,
): Promise<ProgramModule> {
  const existing = modulesByResolvedId.get(resolved.resolvedId);
  if (existing !== undefined) {
    return existing;
  }

  const loaded = resolved.external
    ? externalLoadedModule(resolved)
    : await options.host.load(resolved);
  const result =
    loaded.kind === "esm" && loaded.source !== null
      ? buildLoadedModule(loaded, loaded.source, options.ids)
      : null;

  const module = new ProgramModule(result?.moduleIR.id ?? options.ids.moduleId(), {
    resolvedId: loaded.resolvedId,
    kind: loaded.kind,
  });

  program.addModule(module);
  modulesByResolvedId.set(loaded.resolvedId, module);

  if (result !== null) {
    moduleBuilds.set(module, result);
  }

  return module;
}

function buildLoadedModule(
  loaded: LoadedModule,
  source: string,
  ids: IRIdAllocator,
): ModuleIRBuildResult {
  try {
    return new ModuleIRBuilder({ ids }).build(parseModule(loaded.resolvedId, source));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to build ${loaded.resolvedId}: ${message}`);
  }
}

function externalLoadedModule(resolved: ResolvedModule): LoadedModule {
  return {
    resolvedId: resolved.resolvedId,
    source: null,
    kind: "external",
  };
}

function staticDependencies(buildResult: ModuleIRBuildResult): StaticDependency[] {
  const dependencies = [
    ...importDependencies(buildResult.moduleIR.imports),
    ...exportDependencies(buildResult.moduleIR.exports),
  ];
  const byGraphEdge = new Map<string, StaticDependency>();

  for (const dependency of dependencies) {
    byGraphEdge.set(`${dependency.kind}\0${dependency.specifier}`, dependency);
  }

  return [...byGraphEdge.values()];
}

interface StaticDependency {
  readonly specifier: string;
  readonly kind: ProgramModuleDependency["kind"];
}

function importDependencies(imports: readonly ModuleImport[]): StaticDependency[] {
  return imports.map((record) => ({
    specifier: record.source,
    kind: "static-import",
  }));
}

function exportDependencies(exports: readonly ModuleExport[]): StaticDependency[] {
  const dependencies: StaticDependency[] = [];

  for (const record of exports) {
    if (record.kind === "re-export" || record.kind === "export-all") {
      dependencies.push({
        specifier: record.source,
        kind: "re-export",
      });
    }
  }

  return dependencies;
}

function pruneBuildsWithOpaqueDependencies(
  program: Program,
  moduleBuilds: Map<ProgramModule, ModuleIRBuildResult>,
): void {
  let changed = true;

  while (changed) {
    changed = false;

    for (const module of program.modules) {
      if (!moduleBuilds.has(module)) continue;

      const hasOpaqueDependency = program.dependenciesFrom(module).some((dependency) => {
        return dependency.to.kind === "opaque" && !moduleBuilds.has(dependency.to);
      });

      if (!hasOpaqueDependency) continue;

      moduleBuilds.delete(module);
      changed = true;
    }
  }
}
