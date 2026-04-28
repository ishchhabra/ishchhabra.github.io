import type { FuncOp } from "../../ir/core/FuncOp";
import type { DeclarationId, Value } from "../../ir/core/Value";

export class PhiLoweringResult {
  readonly backingForParam = new Map<Value, DeclarationId>();
}

const resultsByFunction = new WeakMap<FuncOp, PhiLoweringResult>();

export function getPhiLoweringResult(funcOp: FuncOp): PhiLoweringResult | undefined {
  return resultsByFunction.get(funcOp);
}

export function recordPhiLowering(funcOp: FuncOp, param: Value, backing: DeclarationId): void {
  let result = resultsByFunction.get(funcOp);
  if (result === undefined) {
    result = new PhiLoweringResult();
    resultsByFunction.set(funcOp, result);
  }
  result.backingForParam.set(param, backing);
}
