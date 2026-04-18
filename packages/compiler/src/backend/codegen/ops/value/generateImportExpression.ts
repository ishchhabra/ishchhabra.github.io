import * as t from "@babel/types";
import { ImportExpressionOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateImportExpressionOp(
  instruction: ImportExpressionOp,
  generator: CodeGenerator,
): t.Expression {
  const source = generator.values.get(instruction.source.id);
  if (source === undefined) {
    throw new Error(`Value ${instruction.source.id} not found`);
  }

  t.assertExpression(source);

  const node = t.callExpression(t.import(), [source]);
  generator.values.set(instruction.place.id, node);
  return node;
}
