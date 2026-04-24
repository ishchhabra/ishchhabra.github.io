import * as t from "@babel/types";
import { ExportDefaultDeclarationOp } from "../../../../ir";
import { ClassDeclarationOp } from "../../../../ir/ops/class/ClassDeclaration";
import { FunctionDeclarationOp } from "../../../../ir/ops/func/FunctionDeclaration";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateClassDeclarationOp } from "../declaration/generateClassDeclaration";
import { generateFunctionDeclarationOp } from "../declaration/generateFunctionDeclaration";

export function generateExportDefaultDeclarationOp(
  instruction: ExportDefaultDeclarationOp,
  generator: CodeGenerator,
): t.ExportDefaultDeclaration {
  // Def-use traversal: if the exported place is defined by a
  // function/class declaration op, embed that op's declaration AST
  // directly — `export default function Foo() {}` is a single
  // grammatical production (§15.2.3.1), not `export default <Foo>`
  // wrapping an expression.
  const definer = instruction.declaration.def;
  if (definer instanceof FunctionDeclarationOp) {
    return t.exportDefaultDeclaration(generateFunctionDeclarationOp(definer, generator));
  }
  if (definer instanceof ClassDeclarationOp) {
    return t.exportDefaultDeclaration(generateClassDeclarationOp(definer, generator));
  }

  const value = generator.values.get(instruction.declaration.id);
  if (value === undefined) {
    throw new Error(`Value ${instruction.declaration.id} not found`);
  }

  // When ExportDeclarationMergingPass converts `export { x as default }`
  // into an ExportDefaultDeclaration, the declaration place may resolve
  // to a VariableDeclaration (from a StoreLocal with emit=false). Extract
  // the init expression — `export default <VariableDeclaration>` is not
  // valid JS, only `export default <Expression>` is.
  if (t.isVariableDeclaration(value)) {
    const init = value.declarations[0]?.init;
    if (init) {
      return t.exportDefaultDeclaration(init);
    }
  }

  // `export default function() {}` is lowered via FunctionExpressionOp
  // (which handles the anonymous case), so codegen produces a
  // `FunctionExpression`. Promote it back to `FunctionDeclaration`
  // so Babel emits `export default function() {}` rather than
  // `export default (function() {})`.
  if (t.isFunctionExpression(value)) {
    return t.exportDefaultDeclaration(
      t.functionDeclaration(
        value.id ?? null,
        value.params,
        value.body,
        value.generator,
        value.async,
      ),
    );
  }

  if (!t.isExpression(value)) {
    throw new Error(`Unsupported export default declaration type: ${value?.type}`);
  }

  return t.exportDefaultDeclaration(value);
}
