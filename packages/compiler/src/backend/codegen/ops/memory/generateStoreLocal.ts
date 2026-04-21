import * as t from "@babel/types";
import { getCodegenDeclarationKind, StoreLocalOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateStoreLocalOp(
  instruction: StoreLocalOp,
  generator: CodeGenerator,
): t.Statement {
  let lval = generator.values.get(instruction.lval.id);
  if (lval === undefined || lval === null) {
    lval = generator.getPlaceIdentifier(instruction.lval);
  }
  t.assertLVal(lval);

  // `value` may be unregistered in `generator.values` when mem2reg
  // aliased a LoadLocal to an op-introduced entry binding
  // (ForOfOp.iterationValue, ForInOp iter-target defs, try handler
  // params). Those live on `BasicBlock.entryBindings` and on rename
  // stacks but aren't populated in the codegen value map. Fall back
  // to a place-derived identifier — the same pattern `lval` uses.
  let value = generator.values.get(instruction.value.id);
  if (value === undefined || value === null) {
    value = generator.getPlaceIdentifier(instruction.value);
  }
  t.assertExpression(value);

  const declId = instruction.lval.declarationId;
  const metadata = generator.getDeclarationMetadata(declId);
  const kind = metadata ? getCodegenDeclarationKind(metadata.kind) : undefined;

  let node: t.Statement;
  if (instruction.kind === "declaration" && kind !== undefined) {
    node = t.variableDeclaration(kind, [t.variableDeclarator(lval, value)]);
    generator.declaredDeclarations.add(declId);
  } else if (kind !== undefined) {
    const assignment = t.assignmentExpression("=", lval as t.LVal, value);
    node = t.expressionStatement(assignment);
  } else {
    if (instruction.kind === "declaration") {
      node = t.variableDeclaration(instruction.type, [t.variableDeclarator(lval, value)]);
    } else {
      const assignment = t.assignmentExpression("=", lval as t.LVal, value);
      node = t.expressionStatement(assignment);
    }
  }

  // Always cache the full Declaration / ExpressionStatement node in
  // `places[op.place.id]` so an export wrapper that references this
  // store via its `.declaration` field (and whose codegen reads
  // `places[declaration.id]`) finds a node it can wrap. Standalone
  // emission is decided structurally in `generateOp`, not by an
  // `emit` flag on the op.
  generator.values.set(instruction.place.id, node);
  return node;
}
