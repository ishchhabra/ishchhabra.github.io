import * as t from "@babel/types";
import { StoreContextInstruction } from "../../../../ir/instructions/memory/StoreContext";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateStoreContextInstruction(
  instruction: StoreContextInstruction,
  generator: CodeGenerator,
): t.Statement {
  const lval = generator.places.get(instruction.lval.id);
  if (lval === undefined || lval === null) {
    throw new Error(`Place ${instruction.lval.id} not found for StoreContext lval`);
  }
  t.assertLVal(lval);

  const value = generator.places.get(instruction.value.id);
  t.assertExpression(value);

  if (instruction.kind === "declaration") {
    const node = t.variableDeclaration(instruction.type, [t.variableDeclarator(lval, value)]);
    generator.places.set(instruction.place.id, node);
    return node;
  }

  // Assignment — emit `lval = value`
  const assignment = t.assignmentExpression("=", lval, value);
  const node = t.expressionStatement(assignment);
  generator.places.set(instruction.place.id, assignment);
  return node;
}
