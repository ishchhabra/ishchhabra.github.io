import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { SequenceExpressionInstruction } from "../../../ir/instructions/value/SequenceExpression";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildSequenceExpression(
  node: AST.SequenceExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const expressionPlaces = node.expressions.map((expr) => {
    const exprPlace = buildNode(expr, scope, functionBuilder, moduleBuilder, environment);
    if (exprPlace === undefined || Array.isArray(exprPlace)) {
      throw new Error("Sequence expression element must be a single place");
    }
    return exprPlace;
  });

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    SequenceExpressionInstruction,
    place,
    expressionPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
