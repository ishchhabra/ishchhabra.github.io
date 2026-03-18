import * as t from "@babel/types";
import { StoreLocalInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateStoreLocalInstruction(
  instruction: StoreLocalInstruction,
  generator: CodeGenerator,
): t.Statement {
  const lval = generator.places.get(instruction.lval.id);
  if (lval === undefined || lval === null) {
    throw new Error(
      `Place ${instruction.lval.id} not found for StoreLocal lval (name=${instruction.lval.identifier.name})`,
    );
  }
  t.assertLVal(lval);

  const value = generator.places.get(instruction.value.id);
  t.assertExpression(value);

  const node = t.variableDeclaration(instruction.type, [t.variableDeclarator(lval, value)]);
  generator.places.set(instruction.place.id, node);
  return node;
}
