import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { JSXMemberExpressionInstruction, Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildJSXMemberExpression(
  node: AST.JSXMemberExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const objectPlace = buildNode(node.object, scope, functionBuilder, moduleBuilder, environment);
  if (objectPlace === undefined || Array.isArray(objectPlace)) {
    throw new Error("JSX member expression object should be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    JSXMemberExpressionInstruction,
    place,
    objectPlace,
    node.property.name,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
