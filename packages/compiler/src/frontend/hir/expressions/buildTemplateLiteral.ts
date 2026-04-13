import type { TemplateLiteral } from "oxc-parser";
import { Environment } from "../../../environment";
import { TemplateLiteralOp } from "../../../ir/ops/prim/TemplateLiteral";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildTemplateLiteral(
  node: TemplateLiteral,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const quasis = node.quasis;

  const expressionPlaces = node.expressions.map((expr) => {
    const exprPlace = buildNode(expr, scope, functionBuilder, moduleBuilder, environment);
    if (exprPlace === undefined || Array.isArray(exprPlace)) {
      throw new Error("Template literal expression must be a single place");
    }
    return exprPlace;
  });

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(
    TemplateLiteralOp,
    place,
    quasis as any,
    expressionPlaces,
  );
  functionBuilder.addOp(instruction);
  return place;
}
