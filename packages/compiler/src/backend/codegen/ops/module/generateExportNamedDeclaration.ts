import * as t from "@babel/types";
import { ExportNamedDeclarationOp } from "../../../../ir";
import { ClassDeclarationOp } from "../../../../ir/ops/class/ClassDeclaration";
import { FunctionDeclarationOp } from "../../../../ir/ops/func/FunctionDeclaration";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateClassDeclarationOp } from "../declaration/generateClassDeclaration";
import { generateFunctionDeclarationOp } from "../declaration/generateFunctionDeclaration";

export function generateExportNamedDeclarationOp(
  instruction: ExportNamedDeclarationOp,
  generator: CodeGenerator,
): t.ExportNamedDeclaration {
  if (instruction.declaration !== undefined) {
    // Def-use traversal: the declaration operand's definer op
    // produces the embedded declaration AST directly.
    const definer = instruction.declaration.def;
    let decl: t.Declaration;
    if (definer instanceof FunctionDeclarationOp) {
      decl = generateFunctionDeclarationOp(definer, generator);
    } else if (definer instanceof ClassDeclarationOp) {
      decl = generateClassDeclarationOp(definer, generator);
    } else {
      // Fall back to whatever lives in `values` — other declaration
      // kinds (e.g. VariableDeclaration produced by a store whose
      // statement-emission was suppressed).
      const fallback = generator.values.get(instruction.declaration.id);
      if (fallback === undefined) {
        throw new Error(`Value ${instruction.declaration.id} not found`);
      }
      t.assertDeclaration(fallback);
      decl = fallback;
    }

    const node = t.exportNamedDeclaration(decl, []);
    generator.values.set(instruction.place.id, node);
    return node;
  }

  const specifiers = instruction.specifiers.map((specifier) => {
    const node = generator.values.get(specifier.id);
    if (node === undefined) {
      throw new Error(`Value ${specifier.id} not found`);
    }

    t.assertExportSpecifier(node);
    return node;
  });

  const node = t.exportNamedDeclaration(null, specifiers);
  generator.values.set(instruction.place.id, node);
  return node;
}
