import type * as JSX from "estree-jsx";
import { Environment } from "../../../environment";
import { JSXClosingElementInstruction, Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildJSXClosingElement(
  node: JSX.JSXClosingElement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const tagPlace = buildNode(node.name, scope, functionBuilder, moduleBuilder, environment);
  if (tagPlace === undefined || Array.isArray(tagPlace)) {
    throw new Error("JSX closing element tag name should be a single place");
  }

  const identifier = environment.createIdentifier(undefined, scope.allocateName());
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(JSXClosingElementInstruction, place, tagPlace);
  functionBuilder.addInstruction(instruction);
  return place;
}
