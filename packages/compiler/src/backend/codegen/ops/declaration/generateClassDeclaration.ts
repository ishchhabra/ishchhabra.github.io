import * as t from "@babel/types";
import { ClassDeclarationOp } from "../../../../ir/ops/class/ClassDeclaration";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateClassDeclarationOp(
  instruction: ClassDeclarationOp,
  generator: CodeGenerator,
): t.ClassDeclaration {
  const name = instruction.place.name ?? `$${instruction.place.id}`;
  const idNode = t.identifier(name);

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

  const node = t.classDeclaration(idNode, superClass, t.classBody(body));
  generator.declaredDeclarations.add(instruction.place.declarationId);
  generator.values.set(instruction.place.id, node);
  return node;
}
