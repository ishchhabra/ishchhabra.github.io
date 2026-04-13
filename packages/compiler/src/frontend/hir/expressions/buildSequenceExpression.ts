import type { SequenceExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { SequenceExpressionOp } from "../../../ir/ops/arith/SequenceExpression";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildSequenceExpression(
  node: SequenceExpression,
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
  const instruction = environment.createOperation(SequenceExpressionOp, place, expressionPlaces);
  functionBuilder.addOp(instruction);
  return place;
}
