import { IRIdAllocator } from "../ir/core/IRIdAllocator";
import type { Program } from "../ir/core/Program";
import type { ProgramModule } from "../ir/core/ProgramModule";
import { buildProgram, type ProgramBuildResult } from "./buildProgram";
import { emitProgramJavaScript } from "./emitProgramJavaScript";
import type { ModuleEnvironment, ModuleHost } from "./ModuleHost";
import { runProgramCompilerPasses } from "./runProgramCompilerPasses";

declare const opaqueGraphId: unique symbol;

export type GraphId = string & {
  readonly [opaqueGraphId]: "GraphId";
};

export type EmissionDecision =
  | CodeEmissionDecision
  | EmptyEmissionDecision
  | PassthroughEmissionDecision
  | OpaqueEmissionDecision;

export interface CodeEmissionDecision {
  readonly kind: "code";
  readonly code: string;
}

export interface EmptyEmissionDecision {
  readonly kind: "empty";
}

export interface PassthroughEmissionDecision {
  readonly kind: "passthrough";
}

export interface OpaqueEmissionDecision {
  readonly kind: "opaque";
}

export interface CompileGraphRequest {
  readonly environment: ModuleEnvironment;
  readonly host: ModuleHost;
  readonly entrypoints: readonly string[];
}

export interface EmissionRequest {
  readonly environment: ModuleEnvironment;
  readonly graphId?: GraphId;
  readonly resolvedId: string;
}

export interface CompileGraphResult {
  readonly graphId: GraphId;
  readonly program: Program;
  readonly buildResult: ProgramBuildResult;
  readonly emissions: ReadonlyMap<string, EmissionDecision>;
}

/**
 * Owns compiler graph lifecycle for one adapter instance.
 *
 * Bundler integrations supply module-system services through `ModuleHost` and
 * adapt `EmissionDecision` values back to their hook APIs. The compiler session
 * owns graph compilation, invalidation, and output ownership decisions.
 */
export class ProgramSession {
  readonly #graphs: Map<GraphId, ProgramGraphRecord> = new Map();
  readonly #moduleOwnersByEnvironment: Map<string, Map<string, GraphId>> = new Map();
  #nextGraphId = 1;

  public emissionFor(request: EmissionRequest): EmissionDecision | undefined {
    if (request.graphId !== undefined) {
      return this.#graphs.get(request.graphId)?.emissions.get(request.resolvedId);
    }

    const environmentModules = this.#moduleOwnersByEnvironment.get(
      environmentKey(request.environment),
    );
    const graphId = environmentModules?.get(request.resolvedId);
    if (graphId === undefined) return undefined;

    return this.#graphs.get(graphId)?.emissions.get(request.resolvedId);
  }

  public async compileGraph(request: CompileGraphRequest): Promise<CompileGraphResult> {
    const ids = new IRIdAllocator();
    const buildResult = await buildProgram({
      ids,
      host: request.host,
      entrypoints: request.entrypoints,
    });

    runProgramCompilerPasses(buildResult, ids);

    const graphId = this.#graphId();
    const emissions = decisionsForProgram(buildResult);
    this.#recordGraph({
      graphId,
      environment: request.environment,
      emissions,
    });

    return {
      graphId,
      program: buildResult.program,
      buildResult,
      emissions,
    };
  }

  public invalidate(): void {
    this.#graphs.clear();
    this.#moduleOwnersByEnvironment.clear();
  }

  #recordGraph(record: ProgramGraphRecord): void {
    this.#graphs.set(record.graphId, record);

    const key = environmentKey(record.environment);
    let environmentModules = this.#moduleOwnersByEnvironment.get(key);

    if (environmentModules === undefined) {
      environmentModules = new Map();
      this.#moduleOwnersByEnvironment.set(key, environmentModules);
    }

    for (const resolvedId of record.emissions.keys()) {
      environmentModules.set(resolvedId, record.graphId);
    }
  }

  #graphId(): GraphId {
    const id = `graph:${this.#nextGraphId}`;
    this.#nextGraphId += 1;

    return id as GraphId;
  }
}

interface ProgramGraphRecord {
  readonly graphId: GraphId;
  readonly environment: ModuleEnvironment;
  readonly emissions: ReadonlyMap<string, EmissionDecision>;
}

function decisionsForProgram(
  buildResult: ProgramBuildResult,
): ReadonlyMap<string, EmissionDecision> {
  const emitted = emitProgramJavaScript(buildResult);
  const decisions = new Map<string, EmissionDecision>();

  for (const module of buildResult.program.modules) {
    decisions.set(module.resolvedId, decisionForModule(module, emitted));
  }

  return decisions;
}

function decisionForModule(
  module: ProgramModule,
  emitted: ReadonlyMap<ProgramModule, string>,
): EmissionDecision {
  const code = emitted.get(module);
  if (code !== undefined) {
    return { kind: "code", code };
  }

  if (module.kind === "external" || module.kind === "opaque") {
    return { kind: "opaque" };
  }

  return { kind: "passthrough" };
}

function environmentKey(environment: ModuleEnvironment): string {
  return `${environment.name}:${environment.consumer}`;
}
