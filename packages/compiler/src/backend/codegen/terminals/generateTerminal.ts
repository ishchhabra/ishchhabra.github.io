import * as t from "@babel/types";
import {
  BaseTerminal,
  BranchTerminal,
  JumpTerminal,
  ReturnTerminal,
  ThrowTerminal,
} from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBranchTerminal } from "./generateBranch";
import { generateJumpTerminal } from "./generateJump";
import { generateReturnTerminal } from "./generateReturn";
import { generateThrowTerminal } from "./generateThrow";

export function generateTerminal(
  terminal: BaseTerminal,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  if (terminal instanceof BranchTerminal) {
    return generateBranchTerminal(terminal, functionIR, generator);
  } else if (terminal instanceof JumpTerminal) {
    return generateJumpTerminal(terminal, functionIR, generator);
  } else if (terminal instanceof ReturnTerminal) {
    return generateReturnTerminal(terminal, generator);
  } else if (terminal instanceof ThrowTerminal) {
    return generateThrowTerminal(terminal, generator);
  }

  throw new Error(`Unsupported terminal type: ${terminal.constructor.name}`);
}
