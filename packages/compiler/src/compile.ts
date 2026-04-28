import { z } from "zod";
import { CodeGenerator } from "./backend/CodeGenerator";
import { ProjectBuilder } from "./frontend/ProjectBuilder";
import { printModuleIR } from "./ir/printer";
import type { PipelineObserver, PipelineStage } from "./pipeline/Observer";
import type { ResolveConstantHook } from "./pipeline/passes/resolveConstant";
import { Pipeline } from "./pipeline/Pipeline";

export const CompilerOptionsSchema = z.object({
  /** Whether to enable the optimizer */
  enableOptimizer: z.boolean().default(true),
  /** Whether to enable the algebraic simplification pass */
  enableAlgebraicSimplificationPass: z.boolean().default(true),
  /** Whether to enable the reassociation pass (canonicalize *, &, |, ^ chains). */
  enableReassociationPass: z.boolean().default(true),
  /** Whether to enable constant propagation pass */
  enableConstantPropagationPass: z.boolean().default(true),
  /** Whether to enable CFG simplification pass */
  enableCFGSimplificationPass: z.boolean().default(true),
  /** Whether to enable the expression inlining pass */
  enableExpressionInliningPass: z.boolean().default(true),
  /** Whether to enable the unused export elimination pass */
  enableUnusedExportEliminationPass: z.boolean().default(true),
  /** Whether to enable the capture pruning pass */
  enableCapturePruningPass: z.boolean().default(true),
  /** Whether to enable the dead code elimination pass */
  enableDeadCodeEliminationPass: z.boolean().default(true),
  /** Whether to reconstitute SSA diamonds into JS conditional expressions */
  enableConditionalExpressionReconstitutionPass: z.boolean().default(true),
  /** Whether to reconstitute SSA diamonds into JS logical expressions */
  enableLogicalExpressionReconstitutionPass: z.boolean().default(true),
  /** Whether to reconstitute load/compute/store patterns into JS assignment expressions */
  enableAssignmentExpressionReconstitutionPass: z.boolean().default(true),

  /** Whether to enable the late optimizer */
  enableLateOptimizer: z.boolean().default(true),
  /** Whether to enable the late copy propagation pass */
  enableLateCopyPropagationPass: z.boolean().default(true),
  /** Whether to enable the late dead store elimination pass */
  enableLateDeadStoreEliminationPass: z.boolean().default(true),
  /** Whether to enable the late dead code elimination pass */
  enableLateDeadCodeEliminationPass: z.boolean().default(true),
  /** Whether to enable the scalar replacement of aggregates pass */
  enableScalarReplacementOfAggregatesPass: z.boolean().default(true),
  /** Whether to enable the export declaration merging pass */
  enableExportDeclarationMergingPass: z.boolean().default(true),

  /**
   * Hook called for each instruction during constant propagation.
   * Return a compile-time constant via `ctx.set()` to treat the
   * instruction's result as a known value for partial evaluation.
   */
  resolveConstant: z.function().optional(),
});

export type CompilerOptions = z.infer<typeof CompilerOptionsSchema> & {
  resolveConstant?: ResolveConstantHook;
};

export function compile(
  entryPoint: string,
  options: CompilerOptions = CompilerOptionsSchema.parse({}),
) {
  const projectUnit = new ProjectBuilder().build(entryPoint);
  new Pipeline(projectUnit, options).run();
  const code = new CodeGenerator(entryPoint, projectUnit).generate();
  return code;
}

export function compileFromSource(
  source: string,
  options: CompilerOptions = CompilerOptionsSchema.parse({}),
) {
  const virtualPath = "input.js";
  const projectUnit = new ProjectBuilder().buildFromSource(source, virtualPath);
  new Pipeline(projectUnit, options).run();
  const code = new CodeGenerator(virtualPath, projectUnit).generate();
  return code;
}

export interface CompilationStages {
  hir: string;
  ssa: string;
  optimized: string;
  ssaEliminated: string;
  lateOptimized: string;
  output: string;
}

/**
 * Compile and capture an IR snapshot at each stage boundary. Used by
 * the compiler playground / diagnostic tooling to visualize the
 * per-stage output. Under the hood: a `PipelineObserver` attached to
 * the unified {@link Pipeline} — same transform path as {@link compile},
 * just with a snapshot tap at each stage.
 */
export function compileFromSourceWithStages(
  source: string,
  options: CompilerOptions = CompilerOptionsSchema.parse({}),
): CompilationStages {
  const virtualPath = "input.js";
  const projectUnit = new ProjectBuilder().buildFromSource(source, virtualPath);
  const moduleIR = projectUnit.modules.get(virtualPath)!;

  const hir = printModuleIR(moduleIR);

  const snapshots: Partial<Record<PipelineStage, string>> = {};
  const observer: PipelineObserver = {
    onStage(stage, mod) {
      snapshots[stage] = printModuleIR(mod);
    },
  };
  new Pipeline(projectUnit, options, undefined, observer).run();

  const output = new CodeGenerator(virtualPath, projectUnit).generate();

  return {
    hir,
    ssa: snapshots["ssa-built"] ?? hir,
    optimized: snapshots["optimized"] ?? snapshots["ssa-built"] ?? hir,
    ssaEliminated: snapshots["ssa-eliminated"] ?? snapshots["optimized"] ?? hir,
    lateOptimized: snapshots["late-optimized"] ?? snapshots["ssa-eliminated"] ?? hir,
    output,
  };
}
