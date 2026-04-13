import { FunctionIR } from "../../ir/core/FunctionIR";

export interface OptimizationResult {
  changed: boolean;
}

export abstract class BaseOptimizationPass {
  constructor(protected readonly functionIR: FunctionIR) {}

  public run() {
    let changed = false;
    let result: OptimizationResult;
    while ((result = this.step()).changed) {
      changed ||= result.changed;
    }

    // Passes mutate `functionIR` in place; the return value carries
    // only the "did anything change" flag. Callers that previously
    // reassigned `functionIR.blocks = result.blocks` are no-ops after
    // the region-ownership migration and have been removed.
    return { changed };
  }

  protected abstract step(): OptimizationResult;
}
