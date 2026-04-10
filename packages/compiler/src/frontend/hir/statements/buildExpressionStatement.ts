import type { ExpressionStatement } from "oxc-parser";
import { castArray } from "lodash-es";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildNode } from "../buildNode";
import { buildAssignmentExpression } from "../expressions/buildAssignmentExpression";

export function buildExpressionStatement(
  node: ExpressionStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place[] | undefined {
  const expression = node.expression;

  // Assignment expressions in statement context don't need result stabilization.
  // Call buildAssignmentExpression directly with statementContext: true to skip it.
  if (expression.type === "AssignmentExpression") {
    buildAssignmentExpression(expression, scope, functionBuilder, moduleBuilder, environment, true);
    return [];
  }

  const expressionPlace = buildNode(expression, scope, functionBuilder, moduleBuilder, environment);
  // The value instruction is already in the block. Codegen will flush it
  // as an expression statement if it has zero uses (side-effect-only).
  // No wrapper instruction needed.
  return castArray(expressionPlace);
}
