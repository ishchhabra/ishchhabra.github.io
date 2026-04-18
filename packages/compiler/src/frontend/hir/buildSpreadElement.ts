import type { SpreadElement } from "oxc-parser";
import { Environment } from "../../environment";
import { Value, SpreadElementOp } from "../../ir";
import { type Scope } from "../scope/Scope";
import { FuncOpBuilder } from "./FuncOpBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";
import { buildNode } from "./buildNode";

export function buildSpreadElement(
  node: SpreadElement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const argumentPlace = buildNode(
    node.argument,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );
  if (argumentPlace === undefined || Array.isArray(argumentPlace)) {
    throw new Error("Spread element argument must be a single place");
  }

  const place = environment.createValue();
  const instruction = environment.createOperation(SpreadElementOp, place, argumentPlace);
  functionBuilder.addOp(instruction);
  return place;
}
