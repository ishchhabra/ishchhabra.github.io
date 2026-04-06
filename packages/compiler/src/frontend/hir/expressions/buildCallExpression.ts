import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { CallExpressionInstruction, Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildCallExpression(
  node: ESTree.CallExpression | ESTree.SimpleCallExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  // In ESTree, optional chaining sets `optional: true` on the CallExpression itself
  // (when it appears inside a ChainExpression).
  const optional = "optional" in node && node.optional === true;
  const callee = node.callee;

  const calleePlace = buildNode(callee, scope, functionBuilder, moduleBuilder, environment);
  if (calleePlace === undefined || Array.isArray(calleePlace)) {
    throw new Error("Call expression callee must be a single place");
  }

  const argumentPlaces = node.arguments.map((argument) => {
    const argumentPlace = buildNode(argument, scope, functionBuilder, moduleBuilder, environment);
    if (argumentPlace === undefined || Array.isArray(argumentPlace)) {
      throw new Error("Call expression argument must be a single place");
    }

    return argumentPlace;
  });

  const identifier = environment.createIdentifier(undefined, scope.allocateName());
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    CallExpressionInstruction,
    place,
    calleePlace,
    argumentPlaces,
    optional,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
