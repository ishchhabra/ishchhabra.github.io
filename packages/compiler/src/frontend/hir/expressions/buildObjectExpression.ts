import type { ObjectExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { ObjectExpressionOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildObjectExpression(
  node: ObjectExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
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

  const place = environment.createValue();
  const instruction = environment.createOperation(ObjectExpressionOp, place, propertyPlaces);
  functionBuilder.addOp(instruction);
  return place;
}
