import * as t from "@babel/types";
import { AssignmentPatternOp } from "../../../../ir/ops/pattern/AssignmentPattern";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateAssignmentPatternOp(
  instruction: AssignmentPatternOp,
  generator: CodeGenerator,
): t.AssignmentPattern {
  let left = generator.places.get(instruction.left.id);
  if (left === undefined) {
    const name = instruction.left.identifier.name ?? `$${instruction.left.identifier.id}`;
    left = t.identifier(name);
    generator.places.set(instruction.left.id, left);
  }

  const right = generator.places.get(instruction.right.id);
  if (right === undefined) {
    throw new Error(`Place ${instruction.right.id} not found`);
  }

  assertAssignmentPatternLeft(left);
  t.assertExpression(right);

  const node = t.assignmentPattern(left, right);
  generator.places.set(instruction.place.id, node);
  return node;
}

function assertAssignmentPatternLeft(
  _node: t.Node | null,
): asserts _node is
  | t.Identifier
  | t.ObjectPattern
  | t.ArrayPattern
  | t.MemberExpression
  | t.TSAsExpression
  | t.TSSatisfiesExpression
  | t.TSTypeAssertion
  | t.TSNonNullExpression {}
