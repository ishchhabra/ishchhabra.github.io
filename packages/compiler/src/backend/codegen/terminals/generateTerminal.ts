import * as t from "@babel/types";
import {
  BaseTerminal,
  BranchTerminal,
  ForOfTerminal,
  JumpTerminal,
  ReturnTerminal,
  SwitchTerminal,
  ThrowTerminal,
  TryTerminal,
} from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBranchTerminal } from "./generateBranch";
import { generateForOfTerminal } from "./generateForOf";
import { generateJumpTerminal } from "./generateJump";
import { generateReturnTerminal } from "./generateReturn";
import { generateSwitchTerminal } from "./generateSwitch";
import { generateThrowTerminal } from "./generateThrow";
import { generateTryTerminal } from "./generateTry";

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
  } else if (terminal instanceof ForOfTerminal) {
    return generateForOfTerminal(terminal, functionIR, generator);
  } else if (terminal instanceof ThrowTerminal) {
    return generateThrowTerminal(terminal, generator);
  } else if (terminal instanceof SwitchTerminal) {
    return generateSwitchTerminal(terminal, functionIR, generator);
  } else if (terminal instanceof TryTerminal) {
    return generateTryTerminal(terminal, functionIR, generator);
  }

  throw new Error(`Unsupported terminal type: ${terminal.constructor.name}`);
}
