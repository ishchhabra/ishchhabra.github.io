import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { ObjectExpressionInstruction } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildObjectExpression(
  node: ESTree.ObjectExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const propertyPlaces = node.properties.map((property) => {
    const propertyPlace = buildNode(property, scope, functionBuilder, moduleBuilder, environment);
    if (propertyPlace === undefined || Array.isArray(propertyPlace)) {
      throw new Error("Object expression property must be a single place");
    }

    return propertyPlace;
  });

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ObjectExpressionInstruction,
    place,
    propertyPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
