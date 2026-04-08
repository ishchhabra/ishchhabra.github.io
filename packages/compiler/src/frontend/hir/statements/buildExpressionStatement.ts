import type * as AST from "../../estree";
import { castArray } from "lodash-es";
import { Environment } from "../../../environment";
import {
  ExpressionStatementInstruction,
  Place,
  StoreContextInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildNode } from "../buildNode";
import { buildAssignmentExpression } from "../expressions/buildAssignmentExpression";

export function buildExpressionStatement(
  node: AST.ExpressionStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place[] | undefined {
  const expression = node.expression;

  // Assignment expressions in statement context don't need result stabilization.
  // Call buildAssignmentExpression directly with statementContext: true to skip it.
  if (expression.type === "AssignmentExpression") {
    buildAssignmentExpression(expression, scope, functionBuilder, moduleBuilder, environment, true);
    return [];
  }

  const expressionPlace = buildNode(expression, scope, functionBuilder, moduleBuilder, environment);
  const expressionPlaces = castArray(expressionPlace);
  const places = expressionPlaces
    .map((exprPlace) => {
      const expressionInstruction = functionBuilder.environment.placeToInstruction.get(
        exprPlace.id,
      );
      // For assignments, since we convert them to a memory instruction,
      // we do not need to emit an expression statement instruction.
      if (
        expressionInstruction instanceof StoreLocalInstruction ||
        expressionInstruction instanceof StoreContextInstruction
      ) {
        return undefined;
      }

      const identifier = environment.createIdentifier();
      const place = environment.createPlace(identifier);
      const instruction = environment.createInstruction(
        ExpressionStatementInstruction,
        place,
        exprPlace,
      );
      functionBuilder.addInstruction(instruction);
      return place;
    })
    .filter((place) => place !== undefined);

  return places;
}
