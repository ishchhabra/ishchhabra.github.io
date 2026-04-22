import * as t from "@babel/types";
import { JumpOp } from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBlock } from "../generateBlock";

export function generateJumpTerminal(
  terminal: JumpOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  // Structured fallthrough: the enclosing terminator emitter will
  // place the target's statements after the structured JS syntax.
  // A jump to it from inside an arm / body is a no-op.
  if (generator.structuredFallthroughStack.includes(terminal.target.id)) {
    return [];
  }

  const breakLabel = generator.getBreakLabel(terminal.target.id);
  if (breakLabel !== undefined) {
    return [t.breakStatement(breakLabel ? t.identifier(breakLabel) : null)];
  }

  const continueLabel = generator.getContinueLabel(terminal.target.id);
  if (continueLabel !== undefined) {
    return [t.continueStatement(continueLabel ? t.identifier(continueLabel) : null)];
  }

  const statements = generateBlock(terminal.target.id, funcOp, generator);
  return statements;
}
