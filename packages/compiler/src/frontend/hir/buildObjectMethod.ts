import type * as AST from "../estree";
import { Environment } from "../../environment";
import { ObjectMethodInstruction, Place } from "../../ir";
import { type Scope } from "../scope/Scope";
import { buildNode } from "./buildNode";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

/**
 * Builds an object method from an ESTree Property node with method: true
 * (or kind: "get" / "set").
 *
 * In ESTree, Babel's ObjectMethod is represented as a Property whose value
 * is a FunctionExpression.
 */
export function buildObjectMethod(
  node: AST.Property,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  // Build the key place
  const keyPlace = buildNode(node.key, scope, functionBuilder, moduleBuilder, environment);
  if (keyPlace === undefined || Array.isArray(keyPlace)) {
    throw new Error(`Unable to build key place for Property (method)`);
  }

  // The value of a method Property is a FunctionExpression
  const fn = node.value as AST.FunctionExpression;
  const params = fn.params;
  const body = fn.body;
  if (body == null) {
    throw new Error("Object methods must have a body");
  }

  const fnScope = functionBuilder.scopeFor(fn);
  const functionIRBuilder = new FunctionIRBuilder(
    params,
    fn,
    body,
    fnScope,
    functionBuilder.scopeMap,
    environment,
    moduleBuilder,
    fn.async ?? false,
    fn.generator ?? false,
  );
  const bodyIR = functionIRBuilder.build();

  functionBuilder.propagateCapturesFrom(functionIRBuilder);

  const capturedPlaces = [...functionIRBuilder.captures.values()];
  const methodIdentifier = environment.createIdentifier();
  const methodPlace = environment.createPlace(methodIdentifier);
  const instruction = environment.createInstruction(
    ObjectMethodInstruction,
    methodPlace,
    keyPlace,
    bodyIR,
    node.computed,
    fn.generator ?? false,
    fn.async ?? false,
    node.kind === "init" ? "method" : node.kind,
    capturedPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return methodPlace;
}
