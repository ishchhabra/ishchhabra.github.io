import type { FuncOp } from "../ir/core/FuncOp";
import type { ModuleIR } from "../ir/core/ModuleIR";
import type { PassResult } from "./PassManager";

/**
 * Named stage boundary in the per-function compilation pipeline.
 * Observers can key on these to build snapshots, timing tables, or
 * trigger verification.
 */
export type PipelineStage =
  | "ssa-built"
  | "optimized"
  | "ssa-eliminated"
  | "late-optimized"
  | "materialized"
  | "exports-merged";

/**
 * Observer hooks for the compilation pipeline.
 *
 * Every hook is optional; observers implement only what they need.
 * Cheap enough that `undefined` handlers skip with no overhead.
 *
 * Event order for one function:
 *
 * ```
 * onStage("ssa-built", …)
 *   onPassStart("algebraic-simplification", …)
 *   onPassEnd("algebraic-simplification", …, { changed: true })
 *   onPassStart("expression-inlining", …)
 *   onPassEnd("expression-inlining", …, { changed: false })
 *   ...
 * onStage("optimized", …)
 * onStage("ssa-eliminated", …)
 *   onPassStart("late-constant-propagation", …)
 *   ...
 * onStage("late-optimized", …)
 * onStage("materialized", …)
 * onStage("exports-merged", …)
 * ```
 */
export interface PipelineObserver {
  /** Fired after a named stage completes. */
  onStage?(stage: PipelineStage, moduleIR: ModuleIR, funcOp: FuncOp): void;

  /** Fired just before a pass begins. */
  onPassStart?(name: string, funcOp: FuncOp): void;

  /** Fired just after a pass finishes, with its result. */
  onPassEnd?(name: string, funcOp: FuncOp, result: PassResult): void;
}
