import type * as ESTree from "estree";
import { Environment } from "../../environment";
import { Place, SpreadElementInstruction } from "../../ir";
import { type Scope } from "../scope/Scope";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";
import { buildNode } from "./buildNode";

export function buildSpreadElement(
  node: ESTree.SpreadElement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const argumentPlace = buildNode(node.argument, scope, functionBuilder, moduleBuilder, environment);
  if (argumentPlace === undefined || Array.isArray(argumentPlace)) {
    throw new Error("Spread element argument must be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    SpreadElementInstruction,
    place,
    argumentPlace,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
