import type { TPrimitiveValue } from "../ops/prim/Literal";

/**
 * Per-export summary. Consumers (cross-module CP, inliner) read these
 * facts without loading the producer module's full IR — modeled after
 * LLVM ThinLTO summaries and Rust `rmeta`.
 */
export interface ExportSummary {
  /** True iff the export is provably unchanging over the module's lifetime. */
  readonly isEffectivelyConst: boolean;
  /** The proven compile-time primitive. Only meaningful when `isEffectivelyConst`. */
  readonly constValue?: TPrimitiveValue;
}

/**
 * Module-level facts published for cross-module reasoning.
 *
 * The single source of truth for "what can other modules assume about
 * this one?" Grows over time: today it only carries per-export
 * constant facts; future stages add function purity signatures,
 * call-graph edges, top-level side-effect flags, etc.
 *
 * Populated by a module-local pass (currently
 * {@link ConstantPropagationPass}); consumed by cross-module
 * evaluation (also CP today; the inliner tomorrow).
 */
export interface ModuleSummary {
  readonly exports: Map<string, ExportSummary>;
}

export function emptyModuleSummary(): ModuleSummary {
  return { exports: new Map() };
}
