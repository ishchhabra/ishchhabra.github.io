import type { DebuggerStatement } from "oxc-parser";
import { DebuggerOp } from "../../ir/ops/debugger/DebuggerOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";

/**
 * Lowers an ECMAScript `debugger` statement.
 */
export function lowerDebuggerStatement(
  builder: FunctionIRBuilder,
  _statement: DebuggerStatement,
): void {
  builder.emit(new DebuggerOp(builder.operationId()));
}
