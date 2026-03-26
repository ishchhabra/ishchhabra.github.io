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

  // Context variable declarations use "let"; reassignments use "const" as a
  // sentinel. For reassignments, emit an assignment expression instead of a
  // new variable declaration.
  if (instruction.type === "let" || instruction.type === "var") {
    const node = t.variableDeclaration(instruction.type, [t.variableDeclarator(lval, value)]);
    generator.places.set(instruction.place.id, node);
    return node;
  }

  // Reassignment — emit `lval = value`
  const assignment = t.assignmentExpression("=", lval, value);
  const node = t.expressionStatement(assignment);
  generator.places.set(instruction.place.id, assignment);
  return node;
}
