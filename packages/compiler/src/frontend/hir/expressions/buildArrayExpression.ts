import type { ArrayExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { ArrayExpressionOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildArrayExpression(
  node: ArrayExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
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

  const place = environment.createValue();
  const instruction = environment.createOperation(ArrayExpressionOp, place, elementPlaces);
  functionBuilder.addOp(instruction);
  return place;
}
