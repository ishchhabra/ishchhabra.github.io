import * as t from "@babel/types";
import { ImportDeclarationOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateImportDeclarationOp(
  instruction: ImportDeclarationOp,
  generator: CodeGenerator,
): t.Statement {
  const source = t.valueToNode(instruction.source);
  const specifiers = instruction.specifiers.map((specifier) => {
    const node = generator.values.get(specifier.id);
    if (node === undefined) {
      throw new Error(`Value ${specifier.id} not found`);
    }

    if (
      !t.isImportSpecifier(node) &&
      !t.isImportDefaultSpecifier(node) &&
      !t.isImportNamespaceSpecifier(node)
    ) {
      throw new Error(`Expected ImportSpecifier, got ${node?.type}`);
    }

    return node;
  });

  return t.importDeclaration(specifiers, source);
}
