import { FuncOp } from "../../ir/core/FuncOp";

export interface OptimizationResult {
  changed: boolean;
}

export abstract class BaseOptimizationPass {
  constructor(protected readonly funcOp: FuncOp) {}

  public run() {
    let changed = false;
    let result: OptimizationResult;
    while ((result = this.step()).changed) {
      changed ||= result.changed;
    }

    // Passes mutate `funcOp` in place; the return value carries
    // only the "did anything change" flag. Callers that previously
    // reassigned `funcOp.blocks = result.blocks` are no-ops after
    // the region-ownership migration and have been removed.
    return { changed };
  }

  protected abstract step(): OptimizationResult;
}
