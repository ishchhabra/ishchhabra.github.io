import { Program } from "oxc-parser";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { DeclarationCollector } from "./DeclarationCollector";
import { DeclarationTable } from "../declarations/DeclarationTable";
import { DeclarationInstantiationPlan } from "./DeclarationInstantiationPlan";
import { ReferenceResolver } from "./ReferenceResolver";
import { ScopeGraph } from "./ScopeGraph";

export interface ScopeAnalysisContext {
  readonly ids: IRIdAllocator;
  readonly declarations: DeclarationTable;
}

export interface ScopeAnalysisResult {
  readonly graph: ScopeGraph;
  readonly instantiation: DeclarationInstantiationPlan;
}

/**
 * Builds ECMAScript scope information for a parsed module.
 *
 * The analysis creates scope owners, registers source declarations, records
 * declaration-instantiation order, and resolves identifier references before IR
 * lowering begins.
 */
export function analyzeScopes(
  program: Program,
  context: ScopeAnalysisContext,
): ScopeAnalysisResult {
  const collector = new DeclarationCollector(context);
  collector.collectProgram(program);

  const resolver = new ReferenceResolver(collector.graph);
  resolver.resolveProgram(program);

  return {
    graph: collector.graph,
    instantiation: collector.instantiation,
  };
}
