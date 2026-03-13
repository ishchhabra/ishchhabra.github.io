import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildJSXExpressionContainer(
  nodePath: NodePath<t.JSXExpressionContainer>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place | undefined {
  const expressionPath = nodePath.get("expression");
  if (expressionPath.isJSXEmptyExpression()) {
    return undefined;
  }

  const place = buildNode(expressionPath, functionBuilder, moduleBuilder, environment);
  if (Array.isArray(place)) {
    throw new Error("JSX expression container should be a single place");
  }
  return place;
}
