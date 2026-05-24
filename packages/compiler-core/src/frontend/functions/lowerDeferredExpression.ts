import type { Expression } from "oxc-parser";

import type { FunctionIR } from "../../ir/core/FunctionIR";
import { ReturnTerminatorOp } from "../../ir/ops/control/ReturnTerminatorOp";
import type { ScopeOwnerNode } from "../ast/types";
import { lowerExpression } from "../expressions/lowerExpression";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";

/**
 * Lowers an expression into a nested function body for deferred evaluation.
 */
export function lowerDeferredExpression(
  builder: FunctionIRBuilder,
  expression: Expression,
  kind: FunctionIR["kind"],
  captureOwner?: ScopeOwnerNode,
): FunctionIR {
  const captures = captureOwner === undefined ? [] : builder.capturesForOwner(captureOwner);
  const nested = builder.createNestedFunctionIR({ kind, captures });
  const value = lowerExpression(nested.builder, expression);

  nested.builder.terminate(new ReturnTerminatorOp(nested.builder.operationId(), value));

  return nested.functionIR;
}
