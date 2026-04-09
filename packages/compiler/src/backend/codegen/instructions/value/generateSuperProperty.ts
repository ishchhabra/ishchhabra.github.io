import * as t from "@babel/types";
import { SuperPropertyInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateSuperPropertyInstruction(
  instruction: SuperPropertyInstruction,
  generator: CodeGenerator,
): t.MemberExpression {
  const property = generator.places.get(instruction.property.id);
  if (property === undefined) {
    throw new Error(`Place ${instruction.property.id} not found`);
  }
  t.assertExpression(property);

  const node = t.memberExpression(t.super(), property, instruction.computed);
  generator.places.set(instruction.place.id, node);
  return node;
}
