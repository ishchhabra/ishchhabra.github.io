import * as t from "@babel/types";
import { AssignmentPatternOp } from "../../../../ir/ops/pattern/AssignmentPattern";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateAssignmentPatternOp(
  instruction: AssignmentPatternOp,
  generator: CodeGenerator,
): t.AssignmentPattern {
  let left = generator.values.get(instruction.left.id);
  if (left === undefined) {
    const name = instruction.left.name ?? `$${instruction.left.id}`;
    left = t.identifier(name);
    generator.values.set(instruction.left.id, left);
  }

  const right = generator.values.get(instruction.right.id);
  if (right === undefined) {
    throw new Error(`Value ${instruction.right.id} not found`);
  }

  assertAssignmentPatternLeft(left);
  t.assertExpression(right);

  const node = t.assignmentPattern(left, right);
  generator.values.set(instruction.place.id, node);
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
