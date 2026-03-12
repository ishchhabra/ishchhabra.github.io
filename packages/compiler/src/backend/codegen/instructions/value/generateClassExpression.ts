import * as t from "@babel/types";
import { ClassExpressionInstruction } from "../../../../ir/instructions/value/ClassExpression";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateClassExpressionInstruction(
  instruction: ClassExpressionInstruction,
  generator: CodeGenerator,
): t.ClassExpression {
  const node = instruction.nodePath!.node;
  generator.places.set(instruction.place.id, node);
  return node;
}
