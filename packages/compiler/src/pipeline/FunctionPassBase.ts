import { FuncOp } from "../ir/core/FuncOp";
import type { PassResult } from "./PassManager";

export abstract class FunctionPassBase {
  constructor(protected readonly funcOp: FuncOp) {}

  public run(): PassResult {
    let changed = false;
    let result: PassResult;
    while ((result = this.step()).changed) {
      changed ||= result.changed;
    }

    // Passes mutate `funcOp` in place; the return value carries
    // only the "did anything change" flag.
    return { changed };
  }

  protected abstract step(): PassResult;
}
