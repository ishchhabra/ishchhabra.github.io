import type { Expression } from "oxc-parser";
import type { FunctionIR } from "../../ir/core/FunctionIR";
import { ReturnTerminatorOp } from "../../ir/ops/control/ReturnTerminatorOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "../expressions/lowerExpression";

/**
 * Lowers an expression into a nested function body for deferred evaluation.
 */
export function lowerDeferredExpression(
  builder: FunctionIRBuilder,
  expression: Expression,
  kind: FunctionIR["kind"],
): FunctionIR {
  const nested = builder.createNestedFunctionIR({ kind });
  const value = lowerExpression(nested.builder, expression);

  nested.builder.terminate(new ReturnTerminatorOp(nested.builder.operationId(), value));

  return nested.functionIR;
}
