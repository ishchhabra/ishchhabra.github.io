import * as t from "@babel/types";
import { JumpOp } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBlock } from "../generateBlock";

export function generateJumpTerminal(
  terminal: JumpOp,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  const breakLabel = generator.getBreakLabel(terminal.target);
  if (breakLabel !== undefined) {
    return [t.breakStatement(breakLabel ? t.identifier(breakLabel) : null)];
  }

  const continueLabel = generator.getContinueLabel(terminal.target);
  if (continueLabel !== undefined) {
    return [t.continueStatement(continueLabel ? t.identifier(continueLabel) : null)];
  }

  const statements = generateBlock(terminal.target, functionIR, generator);
  return statements;
}
