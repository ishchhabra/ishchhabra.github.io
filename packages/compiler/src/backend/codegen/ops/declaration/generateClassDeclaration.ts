import * as t from "@babel/types";
import { ClassDeclarationOp } from "../../../../ir/ops/class/ClassDeclaration";
import { CodeGenerator } from "../../../CodeGenerator";

/**
 * Idempotent. Repeated calls on the same op return the same AST
 * node, so consumers can safely call via def-use traversal.
 */
export function generateClassDeclarationOp(
  instruction: ClassDeclarationOp,
  generator: CodeGenerator,
): t.ClassDeclaration {
  const cached = generator.declarationAstCache.get(instruction);
  if (cached !== undefined) return cached as t.ClassDeclaration;

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

  const decl = t.classDeclaration(idNode, superClass, t.classBody(body));
  generator.declarationAstCache.set(instruction, decl);
  generator.declaredDeclarations.add(instruction.place.declarationId);
  // `values` holds an expression-compatible reference (Identifier).
  // Consumers needing the declaration AST walk def-use edges to
  // this op and call its codegen.
  generator.values.set(instruction.place.id, t.identifier(name));
  return decl;
}
