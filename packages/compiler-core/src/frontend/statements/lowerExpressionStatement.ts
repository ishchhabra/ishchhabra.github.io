import type { Expression } from "oxc-parser";

import { lowerExpression } from "../expressions/lowerExpression";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";

/**
 * Lowers an expression in statement position.
 *
 * The expression is evaluated for its runtime effects. Its completion value is
 * intentionally discarded unless an operation is effectful and must be emitted
 * as a statement by backend codegen.
 */
export function lowerExpressionStatement(builder: FunctionIRBuilder, expression: Expression): void {
  lowerExpression(builder, expression);
}
