import * as t from "@babel/types";
import { StoreLocalOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateStoreLocalOp(
  instruction: StoreLocalOp,
  generator: CodeGenerator,
): t.Statement {
  let lval = generator.values.get(instruction.binding.id);
  if (lval === undefined || lval === null) {
    lval = generator.getPlaceIdentifier(instruction.binding);
  }
  t.assertLVal(lval);

  // `value` may be unregistered in `generator.values` when mem2reg
  // aliased a LoadLocal to a value produced by entering a structured
  // successor (for-of values, for-in keys, catch params). Fall back
  // to a place-derived identifier — the same pattern `lval` uses.
  let value = generator.values.get(instruction.value.id);
  if (value === undefined || value === null) {
    value = generator.getPlaceIdentifier(instruction.value);
  }
  t.assertExpression(value);

  const assignment = t.assignmentExpression("=", lval as t.LVal, value);
  const node = t.expressionStatement(assignment);

  // Always cache the full Declaration / ExpressionStatement node in
  // `places[op.place.id]` so an export wrapper that references this
  // store via its `.declaration` field (and whose codegen reads
  // `places[declaration.id]`) finds a node it can wrap. Standalone
  // emission is decided structurally in `generateOp`, not by an
  // `emit` flag on the op.
  generator.values.set(instruction.place.id, node);
  return node;
}
