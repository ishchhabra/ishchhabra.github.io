import * as t from "@babel/types";
import { ForInOp } from "../../../ir";
import { type DestructureTarget } from "../../../ir/core/Destructure";
import { FuncOp } from "../../../ir/core/FuncOp";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";
import { generateDestructureTarget } from "../ops/memory/generateDestructureTarget";

/**
 * Emit a textbook MLIR `ForInOp` as `for (target in object) { ... }`.
 */
export function generateForInStructure(
  structure: ForInOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const iterationValue = generateDestructureTarget(structure.iterationTarget, generator);
  t.assertLVal(iterationValue);

  const object = generator.places.get(structure.object.id);
  if (object === undefined) {
    throw new Error(`Place ${structure.object.id} not found`);
  }
  t.assertExpression(object);

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
  const right = object;
  const node = t.forInStatement(left, right, t.blockStatement(bodyStatements));

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
    const metadata = generator.getDeclarationMetadata(target.place.identifier.declarationId);
    if (metadata?.kind === "let" || metadata?.kind === "var") return metadata.kind;
  }
  return "const";
}
