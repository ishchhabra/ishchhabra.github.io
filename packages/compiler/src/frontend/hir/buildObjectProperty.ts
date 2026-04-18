import type * as AST from "../estree";
import { Environment } from "../../environment";
import { LiteralOp, ObjectPropertyOp } from "../../ir";
import { type Scope } from "../scope/Scope";
import { buildNode } from "./buildNode";
import { FuncOpBuilder } from "./FuncOpBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

export function buildObjectProperty(
  node: AST.Property,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  let keyPlace;
  if (!node.computed && node.key.type === "Identifier") {
    // Non-computed identifier keys are property labels (string literals),
    // not variable references.  Emit a LiteralOp so the key
    // survives SSA transformations (clone/rewrite) unchanged.
    const keyIdentifier = environment.createValue();
    keyPlace = keyIdentifier;
    const keyInstruction = environment.createOperation(LiteralOp, keyPlace, node.key.name);
    functionBuilder.addOp(keyInstruction);
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

  const place = environment.createValue();
  const instruction = environment.createOperation(
    ObjectPropertyOp,
    place,
    keyPlace,
    valuePlace,
    node.computed,
    node.shorthand,
  );
  functionBuilder.addOp(instruction);
  return place;
}
