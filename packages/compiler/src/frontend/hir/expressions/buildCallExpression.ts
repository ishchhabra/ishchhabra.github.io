import { type CallExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { CallExpressionOp, Place, SuperCallOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildCallExpression(
  node: CallExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const callee = node.callee;

  // super(...args) — emit a dedicated SuperCallOp.
  // `super` is not a value and must not be lowered to a Place.
  if (callee.type === "Super") {
    return buildSuperCall(node, scope, functionBuilder, moduleBuilder, environment);
  }

  // In ESTree, optional chaining sets `optional: true` on the CallExpression itself
  // (when it appears inside a ChainExpression).
  const optional = "optional" in node && node.optional === true;

  const calleePlace = buildNode(callee, scope, functionBuilder, moduleBuilder, environment);
  if (calleePlace === undefined || Array.isArray(calleePlace)) {
    throw new Error("Call expression callee must be a single place");
  }

  const argumentPlaces = buildArguments(node, scope, functionBuilder, moduleBuilder, environment);

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(
    CallExpressionOp,
    place,
    calleePlace,
    argumentPlaces,
    optional,
  );
  functionBuilder.addOp(instruction);
  return place;
}

function buildSuperCall(
  node: CallExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const argumentPlaces = buildArguments(node, scope, functionBuilder, moduleBuilder, environment);
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(SuperCallOp, place, argumentPlaces);
  functionBuilder.addOp(instruction);
  return place;
}

function buildArguments(
  node: CallExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place[] {
  return node.arguments.map((argument) => {
    const argumentPlace = buildNode(argument, scope, functionBuilder, moduleBuilder, environment);
    if (argumentPlace === undefined || Array.isArray(argumentPlace)) {
      throw new Error("Call expression argument must be a single place");
    }
    return argumentPlace;
  });
}
