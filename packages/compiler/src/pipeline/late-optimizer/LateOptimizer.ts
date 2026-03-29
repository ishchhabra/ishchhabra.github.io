import { CompilerOptions } from "../../compile";
import { BasicBlock, BlockId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { LateCopyCoalescingPass } from "./passes/LateCopyCoalescingPass";
import { LateCopyPropagationPass } from "./passes/LateCopyPropagationPass";
import { LateDeadCodeEliminationPass } from "./passes/LateDeadCodeEliminationPass";
import { LateExpressionInliningPass } from "./passes/LateExpressionInliningPass";

interface LateOptimizerResult {
  blocks: Map<BlockId, BasicBlock>;
}

/**
 * Post-SSA cleanup optimizer.
 *
 * Runs after SSA elimination to clean up artifacts introduced by phi
 * elimination. Implements Boissinot's "coalesce" phase plus standard
 * cleanup passes.
 *
 * Pipeline order (fixpoint loop):
 *   1. CopyPropagation    — rewrite reads to use original source
 *   2. CopyCoalescing     — merge non-interfering copies (Boissinot coalesce)
 *   3. ExpressionInlining — inline single-use pure consts at use site
 *   4. DeadCodeElimination — remove instructions with no uses
 */
export class LateOptimizer {
  constructor(
    private readonly moduleIR: ModuleIR,
    private readonly functionIR: FunctionIR,
    private readonly options: CompilerOptions,
    private readonly AM: AnalysisManager,
  ) {}

  public run(): LateOptimizerResult {
    let blocks = this.functionIR.blocks;
    let changed = true;

    while (changed) {
      changed = false;

      if (this.options.enableLateCopyPropagationPass) {
        const result = new LateCopyPropagationPass(this.functionIR).run();
        if (result.changed) {
          changed = true;
          this.AM.invalidateFunction(this.functionIR);
        }
        blocks = result.blocks;
      }

      if (this.options.enableLateCopyCoalescingPass) {
        const result = new LateCopyCoalescingPass(
          this.functionIR,
          this.moduleIR.environment,
          this.AM,
        ).run();
        if (result.changed) {
          changed = true;
          this.AM.invalidateFunction(this.functionIR);
        }
        blocks = result.blocks;
      }

      {
        const result = new LateExpressionInliningPass(
          this.functionIR,
          this.moduleIR.environment,
        ).run();
        if (result.changed) {
          changed = true;
          this.AM.invalidateFunction(this.functionIR);
        }
        blocks = result.blocks;
      }

      if (this.options.enableLateDeadCodeEliminationPass) {
        const result = new LateDeadCodeEliminationPass(
          this.functionIR,
          this.moduleIR.environment,
        ).run();
        if (result.changed) {
          changed = true;
          this.AM.invalidateFunction(this.functionIR);
        }
        blocks = result.blocks;
      }
    }

    return { blocks };
  }
}
