import type { NewExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { Value } from "../../../ir";
import { NewExpressionOp } from "../../../ir/ops/call/NewExpression";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildNewExpression(
  node: NewExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const callee = node.callee;

  const calleePlace = buildNode(callee, scope, functionBuilder, moduleBuilder, environment);
  if (calleePlace === undefined || Array.isArray(calleePlace)) {
    throw new Error("New expression callee must be a single place");
  }

  const argumentPlaces = node.arguments.map((argument) => {
    const argumentPlace = buildNode(argument, scope, functionBuilder, moduleBuilder, environment);
    if (argumentPlace === undefined || Array.isArray(argumentPlace)) {
      throw new Error("New expression argument must be a single place");
    }

    return argumentPlace;
  });

  const place = environment.createValue();
  const instruction = environment.createOperation(
    NewExpressionOp,
    place,
    calleePlace,
    argumentPlaces,
  );
  functionBuilder.addOp(instruction);
  return place;
}
