import * as t from "@babel/types";
import { ImportExpressionInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateImportExpressionInstruction(
  instruction: ImportExpressionInstruction,
  generator: CodeGenerator,
): t.Expression {
  const source = generator.places.get(instruction.source.id);
  if (source === undefined) {
    throw new Error(`Place ${instruction.source.id} not found`);
  }

  t.assertExpression(source);

  const node = t.callExpression(t.import(), [source]);
  generator.places.set(instruction.place.id, node);
  return node;
}
