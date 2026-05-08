import type { DebuggerOp } from "../../../../ir/ops/debugger/DebuggerOp";
import { debuggerStatement, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

/**
 * Emits an ECMAScript `debugger` statement.
 */
export function emitDebuggerOp(_context: CodegenContext, _op: DebuggerOp): ESTreeStatement[] {
  return [debuggerStatement()];
}
