import type { JSXMemberExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXMemberExpressionOp, Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildJSXMemberExpression(
  node: JSXMemberExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const objectPlace = buildNode(node.object, scope, functionBuilder, moduleBuilder, environment);
  if (objectPlace === undefined || Array.isArray(objectPlace)) {
    throw new Error("JSX member expression object should be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(
    JSXMemberExpressionOp,
    place,
    objectPlace,
    node.property.name,
  );
  functionBuilder.addOp(instruction);
  return place;
}
