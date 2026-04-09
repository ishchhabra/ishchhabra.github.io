import type { Function, MethodDefinition } from "oxc-parser";
import { Environment } from "../../environment";
import { ClassMethodInstruction, LiteralInstruction, Place } from "../../ir";
import { type Scope } from "../scope/Scope";
import { buildNode } from "./buildNode";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

/**
 * Builds a class method from an OXC MethodDefinition node.
 *
 * Mirrors {@link buildObjectMethod}: the method body becomes its own
 * {@link FunctionIR} so existing function-level optimizations apply.
 * Non-computed identifier keys are emitted as {@link LiteralInstruction}s
 * so the property name survives SSA transformations unchanged (matching
 * the convention in {@link buildObjectProperty}).
 */
export function buildClassMethod(
  node: MethodDefinition,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  if (node.decorators && node.decorators.length > 0) {
    throw new Error("Unsupported: class method decorators");
  }
  if (node.key.type === "PrivateIdentifier") {
    throw new Error("Unsupported: private class methods");
  }

  // Build the key place. Non-computed identifier keys are property labels
  // (string literals), not variable references.
  let keyPlace: Place;
  if (!node.computed && node.key.type === "Identifier") {
    const keyIdentifier = environment.createIdentifier();
    keyPlace = environment.createPlace(keyIdentifier);
    const keyInstruction = environment.createInstruction(
      LiteralInstruction,
      keyPlace,
      node.key.name,
    );
    functionBuilder.addInstruction(keyInstruction);
  } else {
    const built = buildNode(node.key, scope, functionBuilder, moduleBuilder, environment);
    if (built === undefined || Array.isArray(built)) {
      throw new Error("Class method key must be a single place");
    }
    keyPlace = built;
  }

  // The value of a MethodDefinition is a Function (with type "FunctionExpression").
  const fn: Function = node.value;
  if (fn.body == null) {
    throw new Error("Class methods must have a body");
  }

  const fnScope = functionBuilder.scopeFor(fn);
  const methodIRBuilder = new FunctionIRBuilder(
    fn.params,
    fn.body,
    fnScope,
    functionBuilder.scopeMap,
    environment,
    moduleBuilder,
    fn.async ?? false,
    fn.generator ?? false,
  );
  const bodyIR = methodIRBuilder.build();

  functionBuilder.propagateCapturesFrom(methodIRBuilder);

  const capturedPlaces = [...methodIRBuilder.captures.values()];
  const methodIdentifier = environment.createIdentifier();
  const methodPlace = environment.createPlace(methodIdentifier);
  const instruction = environment.createInstruction(
    ClassMethodInstruction,
    methodPlace,
    keyPlace,
    bodyIR,
    node.kind,
    node.computed,
    node.static,
    fn.generator ?? false,
    fn.async ?? false,
    capturedPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return methodPlace;
}
