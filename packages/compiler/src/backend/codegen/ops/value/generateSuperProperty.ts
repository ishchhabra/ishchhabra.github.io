import * as t from "@babel/types";
import { SuperPropertyOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateSuperPropertyOp(
  instruction: SuperPropertyOp,
  generator: CodeGenerator,
): t.MemberExpression {
  const property = generator.values.get(instruction.property.id);
  if (property === undefined) {
    throw new Error(`Value ${instruction.property.id} not found`);
  }
  t.assertExpression(property);

  // Non-computed keys are stored as LiteralOp → StringLiteral in the IR.
  // t.memberExpression requires an Value for non-computed access;
  // convert back here, mirroring generateLoadStaticPropertyOp.
  let key: t.Expression;
  if (
    !instruction.computed &&
    t.isStringLiteral(property) &&
    t.isValidIdentifier(property.value, true)
  ) {
    key = t.identifier(property.value);
  } else {
    key = property;
  }

  const node = t.memberExpression(t.super(), key, instruction.computed);
  generator.values.set(instruction.place.id, node);
  return node;
}
