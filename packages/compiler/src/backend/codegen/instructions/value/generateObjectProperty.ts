import * as t from "@babel/types";
import { ObjectPropertyInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateObjectPropertyInstruction(
  instruction: ObjectPropertyInstruction,
  generator: CodeGenerator,
): t.ObjectProperty {
  let key = generator.places.get(instruction.key.id);
  if (key === undefined) {
    throw new Error(`Place ${instruction.key.id} not found`);
  }

  // Non-computed identifier keys are lowered to LiteralInstructions in the
  // IR.  Convert back to an identifier node so codegen produces
  // `{ name: v }` rather than `{ "name": v }`.  Only convert when the
  // value is a valid identifier — genuinely quoted keys like `{ "a-b": v }`
  // must stay as string literals.
  if (!instruction.computed && t.isStringLiteral(key) && t.isValidIdentifier(key.value)) {
    key = t.identifier(key.value);
  }

  const value = generator.places.get(instruction.value.id);
  if (value === undefined) {
    throw new Error(`Place ${instruction.value.id} not found`);
  }

  t.assertExpression(key);
  if (!(t.isExpression(value) || t.isPatternLike(value))) {
    throw new Error(`Value ${instruction.value.id} is not an expression or pattern`);
  }

  const node = t.objectProperty(key, value, instruction.computed, instruction.shorthand);
  generator.places.set(instruction.place.id, node);
  return node;
}
