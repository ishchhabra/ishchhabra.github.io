import type { SequenceExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { SequenceExpressionOp } from "../../../ir/ops/arith/SequenceExpression";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildSequenceExpression(
  node: SequenceExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
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

  const place = environment.createValue();
  const instruction = environment.createOperation(SequenceExpressionOp, place, expressionPlaces);
  functionBuilder.addOp(instruction);
  return place;
}
