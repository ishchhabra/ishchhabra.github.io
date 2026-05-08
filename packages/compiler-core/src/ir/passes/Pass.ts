import { AnalysisManager, PreservedAnalyses } from "../analysis";
import { FunctionIR } from "../core/FunctionIR";
import { ModuleIR } from "../core/ModuleIR";

/**
 * Result returned by a transform pass.
 *
 * Passes mutate IR in place. The result reports whether a mutation happened
 * and, when it did, which cached analysis remain valid.
 */
export interface PassResult {
  /**
   * Whether the pass mutated IR.
   */
  readonly changed: boolean;

  /**
   * Cached analyses that remain valid after this pass.
   *
   * Omit this when the pass did not mutate IR, or when all cached analyses
   * should be invalidated.
   */
  readonly preserved?: PreservedAnalyses;
}

/**
 * Transform over one function body.
 *
 * Function passes may rewrite operations, values, blocks, and control-flow
 * edges owned by the function. They must report analysis preservation
 * accurately when they mutate IR.
 */
export interface FunctionPass {
  /**
   * Stable pass name used for diagnostics, tracing, and stage captures.
   */
  readonly name: string;

  /**
   * Runs the pass.
   */
  run(fn: FunctionIR, analyses: AnalysisManager): PassResult;
}

/**
 * Transform over one module.
 *
 * Module passes may rewrite module-level structure such as functions, imports,
 * exports, or cross-function metadata. Function-body-only transforms should use
 * `FunctionPass` instead.
 */
export interface ModulePass {
  /**
   * Stable pass name used for diagnostics, tracing, and stage captures.
   */
  readonly name: string;

  /**
   * Runs the pass.
   */
  run(moduleIR: ModuleIR, analyses: AnalysisManager): PassResult;
}

/**
 * Creates a result for a pass that left IR unchanged.
 */
export function unchanged(preserved?: PreservedAnalyses): PassResult {
  return { changed: false, preserved };
}

/**
 * Creates a result for a pass that mutated IR.
 */
export function changed(preserved?: PreservedAnalyses): PassResult {
  return { changed: true, preserved };
}
