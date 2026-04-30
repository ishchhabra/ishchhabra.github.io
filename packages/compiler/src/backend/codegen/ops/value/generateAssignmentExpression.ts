import * as t from "@babel/types";
import { AssignmentExpressionOp, type AssignmentTarget } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateAssignmentExpressionOp(
  instruction: AssignmentExpressionOp,
  generator: CodeGenerator,
): t.AssignmentExpression {
  const left = generateAssignmentTarget(instruction.target, generator);
  const right = generator.values.get(instruction.value.id);
  if (right === undefined || right === null) {
    throw new Error(`Value ${instruction.value.id} not found`);
  }
  t.assertExpression(right);

  const node = t.assignmentExpression(instruction.operator, left, right);
  generator.values.set(instruction.place.id, node);
  return node;
}

export function generateAssignmentTarget(
  target: AssignmentTarget,
  generator: CodeGenerator,
): t.LVal {
  switch (target.kind) {
    case "local":
    case "context": {
      const node =
        generator.values.get(target.binding.id) ?? generator.getPlaceIdentifier(target.binding);
      t.assertLVal(node);
      return node;
    }
    case "static-property": {
      const object = generator.values.get(target.object.id);
      if (object === undefined || object === null) {
        throw new Error(`Value ${target.object.id} not found`);
      }
      t.assertExpression(object);

      let property: t.Identifier | t.Expression;
      if (t.isValidIdentifier(target.property, true)) {
        property = t.identifier(target.property);
      } else {
        property = t.valueToNode(target.property);
      }
      return t.memberExpression(object, property, !t.isIdentifier(property));
    }
    case "dynamic-property": {
      const object = generator.values.get(target.object.id);
      if (object === undefined || object === null) {
        throw new Error(`Value ${target.object.id} not found`);
      }
      t.assertExpression(object);

      const property = generator.values.get(target.property.id);
      if (property === undefined || property === null) {
        throw new Error(`Value ${target.property.id} not found`);
      }
      t.assertExpression(property);
      return t.memberExpression(object, property, true);
    }
  }
}
