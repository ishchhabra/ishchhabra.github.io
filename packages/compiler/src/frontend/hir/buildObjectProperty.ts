import type * as ESTree from "estree";
import { Environment } from "../../environment";
import { LiteralInstruction, ObjectPropertyInstruction } from "../../ir";
import { type Scope } from "../scope/Scope";
import { buildNode } from "./buildNode";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

export function buildObjectProperty(
  node: ESTree.Property,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  let keyPlace;
  if (!node.computed && node.key.type === "Identifier") {
    // Non-computed identifier keys are property labels (string literals),
    // not variable references.  Emit a LiteralInstruction so the key
    // survives SSA transformations (clone/rewrite) unchanged.
    const keyIdentifier = environment.createIdentifier(undefined, scope.allocateName());
    keyPlace = environment.createPlace(keyIdentifier);
    const keyInstruction = environment.createInstruction(
      LiteralInstruction,
      keyPlace,
      node.key.name,
    );
    functionBuilder.addInstruction(keyInstruction);
  } else {
    keyPlace = buildNode(node.key, scope, functionBuilder, moduleBuilder, environment);
    if (keyPlace === undefined || Array.isArray(keyPlace)) {
      throw new Error(`Object property key must be a single place`);
    }
  }

  const valuePlace = buildNode(node.value, scope, functionBuilder, moduleBuilder, environment);
  if (valuePlace === undefined || Array.isArray(valuePlace)) {
    throw new Error(`Object property value must be a single place`);
  }

  const identifier = environment.createIdentifier(undefined, scope.allocateName());
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ObjectPropertyInstruction,
    place,
    keyPlace,
    valuePlace,
    node.computed,
    node.shorthand,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
