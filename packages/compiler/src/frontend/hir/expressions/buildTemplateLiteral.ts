import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { TemplateLiteralInstruction } from "../../../ir/instructions/value/TemplateLiteral";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildTemplateLiteral(
  node: AST.TemplateLiteral,
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
  const instruction = environment.createInstruction(
    TemplateLiteralInstruction,
    place,
    quasis as any,
    expressionPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
