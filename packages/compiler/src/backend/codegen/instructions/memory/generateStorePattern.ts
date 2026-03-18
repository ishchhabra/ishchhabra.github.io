import * as t from "@babel/types";
import { StorePatternInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateStorePatternInstruction(
  instruction: StorePatternInstruction,
  generator: CodeGenerator,
): t.Statement {
  const maybeLval = generator.places.get(instruction.lval.id);
  if (maybeLval === undefined) {
    throw new Error(`Place ${instruction.lval.id} not found`);
  }
  t.assertLVal(maybeLval);

  const value = generator.places.get(instruction.value.id);
  t.assertExpression(value);

  const node = t.variableDeclaration(instruction.type, [t.variableDeclarator(maybeLval, value)]);
  generator.places.set(instruction.place.id, node);
  return node;
}
