import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { NewExpressionInstruction } from "../../../ir/instructions/value/NewExpression";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildNewExpression(
  node: ESTree.NewExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
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

  const identifier = environment.createIdentifier(undefined, scope.allocateName());
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    NewExpressionInstruction,
    place,
    calleePlace,
    argumentPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
