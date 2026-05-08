import type { RegExpLiteralOp } from "../../../../ir/ops/literals/RegExpLiteralOp";
import { regExpLiteral, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

/**
 * Caches the JavaScript expression for a RegExp literal operation result.
 */
export function emitRegExpLiteralOp(
  context: CodegenContext,
  op: RegExpLiteralOp,
): ESTreeStatement[] {
  context.values.set(op.result, regExpLiteral(op.pattern, op.flags));
  return [];
}
