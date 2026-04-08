import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { ArrayPatternInstruction, Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildArrayPattern(
  node: AST.ArrayPattern,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const elementPlaces = node.elements.map((element) => {
    if (element == null) return null;

    const elementPlace = buildNode(element, scope, functionBuilder, moduleBuilder, environment);
    if (elementPlace === undefined || Array.isArray(elementPlace)) {
      throw new Error("Array pattern element must be a single place");
    }

    return elementPlace;
  });

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(ArrayPatternInstruction, place, elementPlaces);
  functionBuilder.addInstruction(instruction);
  return place;
}
