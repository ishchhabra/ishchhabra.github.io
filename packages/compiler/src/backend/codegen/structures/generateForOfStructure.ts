import * as t from "@babel/types";
import { ForOfOp } from "../../../ir";
import { type DestructureTarget } from "../../../ir/core/Destructure";
import { FuncOp } from "../../../ir/core/FuncOp";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";
import { generateDestructureTarget } from "../ops/memory/generateDestructureTarget";

/**
 * Emit a textbook MLIR `ForOfOp` as `for (target of iterable) { ... }`.
 */
export function generateForOfStructure(
  structure: ForOfOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const iterationValue = generateDestructureTarget(structure.iterationTarget, generator);
  t.assertLVal(iterationValue);

  const iterable = generator.values.get(structure.iterable.id);
  if (iterable === undefined) {
    throw new Error(`Value ${structure.iterable.id} not found`);
  }
  t.assertExpression(iterable);

  const label = structure.label;
  generator.controlStack.push({
    kind: "loop",
    label,
    breakTarget: undefined,
    continueTarget: undefined,
  });
  const bodyEntryId = structure.bodyRegion.entry.id;
  const bodyStatements = generateBasicBlock(bodyEntryId, funcOp, generator);
  generator.controlStack.pop();

  const kind = resolveIterationKind(structure.iterationTarget, generator);
  const left = t.variableDeclaration(kind, [t.variableDeclarator(iterationValue)]);
  const right = iterable;
  const node = t.forOfStatement(left, right, t.blockStatement(bodyStatements), structure.isAwait);

  if (label) {
    return [t.labeledStatement(t.identifier(label), node)];
  }
  return [node];
}

function resolveIterationKind(
  target: DestructureTarget,
  generator: CodeGenerator,
): "let" | "const" | "var" {
  if (target.kind === "binding") {
    const metadata = generator.getDeclarationMetadata(target.place.declarationId);
    if (metadata?.kind === "let" || metadata?.kind === "var") return metadata.kind;
  }
  return "const";
}
