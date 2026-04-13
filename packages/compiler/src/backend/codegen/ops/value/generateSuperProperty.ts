import * as t from "@babel/types";
import { SuperPropertyOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateSuperPropertyOp(
  instruction: SuperPropertyOp,
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
