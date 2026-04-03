import * as t from "@babel/types";
import { ClassExpressionInstruction } from "../../../../ir/instructions/value/ClassExpression";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateClassExpressionInstruction(
  instruction: ClassExpressionInstruction,
  generator: CodeGenerator,
): t.ClassExpression {
  const astNode = instruction.nodePath!.node as t.ClassExpression | t.ClassDeclaration;

  const idNode = instruction.identifier ? generator.places.get(instruction.identifier.id) : null;
  if (idNode !== null && !t.isIdentifier(idNode)) {
    throw new Error("Class expression identifier is not an identifier");
  }

  const node = t.classExpression(idNode, astNode.superClass ?? null, astNode.body);
  generator.places.set(instruction.place.id, node);
  return node;
}
