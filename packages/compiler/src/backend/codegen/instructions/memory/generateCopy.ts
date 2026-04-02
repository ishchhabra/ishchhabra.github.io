import * as t from "@babel/types";
import { CopyInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateCopyInstruction(
  instruction: CopyInstruction,
  generator: CodeGenerator,
): t.Node {
  let lval = generator.places.get(instruction.lval.id);
  if (lval === undefined || lval === null) {
    const name = instruction.lval.identifier.name ?? `$${instruction.lval.identifier.id}`;
    lval = t.identifier(name);
    generator.places.set(instruction.lval.id, lval);
  }
  t.assertLVal(lval);

  const value = generator.places.get(instruction.value.id);
  if (value === undefined || value === null) {
    throw new Error(`Place ${instruction.value.id} not found for Copy value`);
  }
  t.assertExpression(value);

  const node = t.assignmentExpression("=", lval, value);
  generator.places.set(instruction.place.id, node);
  return node;
}
