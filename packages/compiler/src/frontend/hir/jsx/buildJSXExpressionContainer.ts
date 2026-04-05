import type * as JSX from "estree-jsx";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildJSXExpressionContainer(
  node: JSX.JSXExpressionContainer,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place | undefined {
  const expression = node.expression;
  if (expression.type === "JSXEmptyExpression") {
    return undefined;
  }

  const place = buildNode(expression, scope, functionBuilder, moduleBuilder, environment);
  if (Array.isArray(place)) {
    throw new Error("JSX expression container should be a single place");
  }
  return place;
}
