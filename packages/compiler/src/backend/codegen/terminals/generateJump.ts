import * as t from "@babel/types";
import { JumpTerminal } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBlock } from "../generateBlock";

export function generateJumpTerminal(
  terminal: JumpTerminal,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  if (generator.isBreakTarget(terminal.target)) {
    return [t.breakStatement()];
  }

  return generateBlock(terminal.target, functionIR, generator);
}
