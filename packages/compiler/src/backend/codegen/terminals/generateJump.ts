import * as t from "@babel/types";
import { JumpTermOp } from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBlock } from "../generateBlock";

export function generateJumpTerminal(
  terminal: JumpTermOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  // `break` / `continue` check FIRST — these are emitted as JS
  // keywords regardless of whether the target is also the fallthrough
  // of an enclosing structured terminator. Inside a switch case, a
  // `break` must emit `break;`, not be silently elided as a fallthrough
  // of the enclosing switch (which happens to have the same target).
  const breakLabel = generator.getBreakLabel(terminal.targetBlock.id);
  if (breakLabel !== undefined) {
    return [t.breakStatement(breakLabel ? t.identifier(breakLabel) : null)];
  }

  const continueLabel = generator.getContinueLabel(terminal.targetBlock.id);
  if (continueLabel !== undefined) {
    return [t.continueStatement(continueLabel ? t.identifier(continueLabel) : null)];
  }

  // Structured fallthrough: the enclosing terminator emitter will
  // place the target's statements after the structured JS syntax.
  // A jump to it (that wasn't a break/continue) is a no-op.
  if (generator.structuredFallthroughStack.includes(terminal.targetBlock.id)) {
    return [];
  }

  const statements = generateBlock(terminal.targetBlock.id, funcOp, generator);
  return statements;
}
