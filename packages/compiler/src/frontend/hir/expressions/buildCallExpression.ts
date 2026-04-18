import { type CallExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { CallExpressionOp, Value, SuperCallOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildCallExpression(
  node: CallExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const callee = node.callee;

  // super(...args) — emit a dedicated SuperCallOp.
  // `super` is not a value and must not be lowered to a Value.
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

  const place = environment.createValue();
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
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const argumentPlaces = buildArguments(node, scope, functionBuilder, moduleBuilder, environment);
  const place = environment.createValue();
  const instruction = environment.createOperation(SuperCallOp, place, argumentPlaces);
  functionBuilder.addOp(instruction);
  return place;
}

function buildArguments(
  node: CallExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value[] {
  return node.arguments.map((argument) => {
    const argumentPlace = buildNode(argument, scope, functionBuilder, moduleBuilder, environment);
    if (argumentPlace === undefined || Array.isArray(argumentPlace)) {
      throw new Error("Call expression argument must be a single place");
    }
    return argumentPlace;
  });
}
