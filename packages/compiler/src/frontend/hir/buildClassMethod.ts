import type { Function, MethodDefinition } from "oxc-parser";
import { Environment } from "../../environment";
import { ClassMethodOp, LiteralOp, Value } from "../../ir";
import { type Scope } from "../scope/Scope";
import { buildNode } from "./buildNode";
import { FuncOpBuilder } from "./FuncOpBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

/**
 * Builds a class method from an OXC MethodDefinition node.
 *
 * Mirrors {@link buildObjectMethod}: the method body becomes its own
 * {@link FuncOp} so existing function-level optimizations apply.
 * Non-computed identifier keys are emitted as {@link LiteralOp}s
 * so the property name survives SSA transformations unchanged (matching
 * the convention in {@link buildObjectProperty}).
 */
export function buildClassMethod(
  node: MethodDefinition,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  if (node.decorators && node.decorators.length > 0) {
    throw new Error("Unsupported: class method decorators");
  }
  if (node.key.type === "PrivateIdentifier") {
    throw new Error("Unsupported: private class methods");
  }

  // Build the key place. Non-computed identifier keys are property labels
  // (string literals), not variable references.
  let keyPlace: Value;
  if (!node.computed && node.key.type === "Identifier") {
    const keyIdentifier = environment.createValue();
    keyPlace = keyIdentifier;
    const keyInstruction = environment.createOperation(LiteralOp, keyPlace, node.key.name);
    functionBuilder.addOp(keyInstruction);
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
  const methodIRBuilder = new FuncOpBuilder(
    fn.params,
    fn.body,
    fnScope,
    functionBuilder.scopeMap,
    environment,
    moduleBuilder,
    fn.async ?? false,
    fn.generator ?? false,
    functionBuilder.funcOpId,
  );
  const bodyIR = methodIRBuilder.build();

  functionBuilder.propagateCapturesFrom(methodIRBuilder);

  const capturedPlaces = [...methodIRBuilder.captures.values()];
  const methodPlace = environment.createValue();
  const instruction = environment.createOperation(
    ClassMethodOp,
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
  functionBuilder.addOp(instruction);
  return methodPlace;
}
