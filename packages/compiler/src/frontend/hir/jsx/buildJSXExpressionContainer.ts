import type { JSXExpressionContainer } from "oxc-parser";
import { Environment } from "../../../environment";
import { Value } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildJSXExpressionContainer(
  node: JSXExpressionContainer,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value | undefined {
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
