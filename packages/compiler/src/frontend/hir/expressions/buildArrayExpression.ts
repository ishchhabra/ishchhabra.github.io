import type { ArrayExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { ArrayExpressionInstruction } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildArrayExpression(
  node: ArrayExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const elementPlaces = node.elements.map((element) => {
    const elementPlace = buildNode(element, scope, functionBuilder, moduleBuilder, environment);
    if (elementPlace === undefined || Array.isArray(elementPlace)) {
      throw new Error("Array expression element must be a single place");
    }

    return elementPlace;
  });

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ArrayExpressionInstruction,
    place,
    elementPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
