import * as t from "@babel/types";
import { StoreDynamicPropertyOp } from "../../../../ir/ops/prop/StoreDynamicProperty";
import { CodeGenerator } from "../../../CodeGenerator";

/**
 * Generates the Babel AST for storing a value into a dynamic object property:
 * `object[property] = value`.
 *
 * We keep a separate `StoreDynamicPropertyOp` (rather than reusing local
 * store instructions) because dynamic property writes typically involve memory
 * and alias analysis that differs from local variable writes.
 */
export function generateStoreDynamicPropertyOp(
  instruction: StoreDynamicPropertyOp,
  generator: CodeGenerator,
) {
  const objectNode = generator.values.get(instruction.object.id);
  if (!objectNode) {
    throw new Error(`Value ${instruction.object.id} not found`);
  }
  t.assertExpression(objectNode);

  const propertyPlace = generator.values.get(instruction.property.id);
  if (!propertyPlace) {
    throw new Error(`Value ${instruction.property.id} not found`);
  }
  t.assertExpression(propertyPlace);

  const valueNode = generator.values.get(instruction.value.id);
  if (!valueNode) {
    throw new Error(`Value ${instruction.value.id} not found`);
  }
  t.assertExpression(valueNode);

  const memberExpr = t.memberExpression(objectNode, propertyPlace, true);

  const node = t.assignmentExpression("=", memberExpr, valueNode);
  generator.values.set(instruction.place.id, node);
  return node;
}
