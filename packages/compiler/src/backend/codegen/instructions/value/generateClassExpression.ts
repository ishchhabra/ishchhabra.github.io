import * as t from "@babel/types";
import { ClassExpressionInstruction } from "../../../../ir/instructions/value/ClassExpression";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateClassExpressionInstruction(
  instruction: ClassExpressionInstruction,
  generator: CodeGenerator,
): t.ClassExpression {
  let idNode: t.Identifier | null = null;
  if (instruction.identifier) {
    const node = generator.places.get(instruction.identifier.id);
    if (node === undefined) {
      throw new Error(`Place ${instruction.identifier.id} not found`);
    }
    if (!t.isIdentifier(node)) {
      throw new Error("Class expression identifier is not an identifier");
    }
    idNode = node;
  }

  let superClass: t.Expression | null = null;
  if (instruction.superClass) {
    const node = generator.places.get(instruction.superClass.id);
    if (node === undefined) {
      throw new Error(`Place ${instruction.superClass.id} not found`);
    }
    t.assertExpression(node);
    superClass = node;
  }

  const body: t.ClassBody["body"] = instruction.elements.map((elementPlace) => {
    const node = generator.places.get(elementPlace.id);
    if (node === undefined) {
      throw new Error(`Place ${elementPlace.id} not found`);
    }
    if (node === null) {
      throw new Error(`Class body element is null (hole)`);
    }
    if (
      !t.isClassMethod(node) &&
      !t.isClassPrivateMethod(node) &&
      !t.isClassProperty(node) &&
      !t.isClassPrivateProperty(node) &&
      !t.isClassAccessorProperty(node) &&
      !t.isStaticBlock(node) &&
      !t.isTSDeclareMethod(node) &&
      !t.isTSIndexSignature(node)
    ) {
      throw new Error(`Unsupported class body element: ${node.type}`);
    }
    return node;
  });

  const node = t.classExpression(idNode, superClass, t.classBody(body));
  generator.places.set(instruction.place.id, node);
  return node;
}
