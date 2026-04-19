import * as t from "@babel/types";
import { ClassExpressionOp } from "../../../../ir/ops/class/ClassExpression";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateClassExpressionOp(
  instruction: ClassExpressionOp,
  generator: CodeGenerator,
): t.ClassExpression {
  const idNode = instruction.name !== null ? t.identifier(instruction.name) : null;

  let superClass: t.Expression | null = null;
  if (instruction.superClass) {
    const node = generator.values.get(instruction.superClass.id);
    if (node === undefined) {
      throw new Error(`Value ${instruction.superClass.id} not found`);
    }
    t.assertExpression(node);
    superClass = node;
  }

  const body: t.ClassBody["body"] = instruction.elements.map((elementPlace) => {
    const node = generator.values.get(elementPlace.id);
    if (node === undefined) {
      throw new Error(`Value ${elementPlace.id} not found`);
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
  generator.values.set(instruction.place.id, node);
  return node;
}
