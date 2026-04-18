import * as t from "@babel/types";
import { ExportDefaultDeclarationOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateExportDefaultDeclarationOp(
  instruction: ExportDefaultDeclarationOp,
  generator: CodeGenerator,
): t.ExportDefaultDeclaration {
  const declaration = generator.values.get(instruction.declaration.id);
  if (declaration === undefined) {
    throw new Error(`Value ${instruction.declaration.id} not found`);
  }

  // When ExportDeclarationMergingPass converts `export { x as default }`
  // into an ExportDefaultDeclaration, the declaration place may resolve
  // to a VariableDeclaration (from a StoreLocal with emit=false). Extract
  // the init expression since `export default <VariableDeclaration>` is
  // not valid JS — only `export default <Expression>` is.
  if (t.isVariableDeclaration(declaration)) {
    const init = declaration.declarations[0]?.init;
    if (init) {
      return t.exportDefaultDeclaration(init);
    }
  }

  // `export default function() {}` is lowered via FunctionExpressionOp
  // (which handles the anonymous case), so codegen produces a FunctionExpression
  // node.  Promote it back to FunctionDeclaration so Babel emits
  // `export default function() {}` instead of `export default (function() {})`.
  if (t.isFunctionExpression(declaration)) {
    return t.exportDefaultDeclaration(
      t.functionDeclaration(
        declaration.id ?? null,
        declaration.params,
        declaration.body,
        declaration.generator,
        declaration.async,
      ),
    );
  }

  if (
    !t.isFunctionDeclaration(declaration) &&
    !t.isClassDeclaration(declaration) &&
    !t.isExpression(declaration)
  ) {
    throw new Error(`Unsupported export default declaration type: ${declaration?.type}`);
  }

  return t.exportDefaultDeclaration(declaration);
}
