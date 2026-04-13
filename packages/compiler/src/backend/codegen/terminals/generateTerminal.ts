import * as t from "@babel/types";
import {
  Operation,
  BranchOp,
  BreakOp,
  ContinueOp,
  JumpOp,
  ReturnOp,
  SwitchOp,
  ThrowOp,
  TryOp,
} from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBranchTerminal } from "./generateBranch";
import { generateBreakTerminal } from "./generateBreak";
import { generateContinueTerminal } from "./generateContinue";
import { generateJumpTerminal } from "./generateJump";
import { generateReturnTerminal } from "./generateReturn";
import { generateSwitchTerminal } from "./generateSwitch";
import { generateThrowTerminal } from "./generateThrow";
import { generateTryTerminal } from "./generateTry";

export function generateTerminal(
  terminal: Operation,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  if (terminal instanceof BranchOp) {
    return generateBranchTerminal(terminal, functionIR, generator);
  } else if (terminal instanceof BreakOp) {
    return generateBreakTerminal(terminal);
  } else if (terminal instanceof ContinueOp) {
    return generateContinueTerminal(terminal);
  } else if (terminal instanceof JumpOp) {
    return generateJumpTerminal(terminal, functionIR, generator);
  } else if (terminal instanceof ReturnOp) {
    return generateReturnTerminal(terminal, generator);
  } else if (terminal instanceof ThrowOp) {
    return generateThrowTerminal(terminal, generator);
  } else if (terminal instanceof SwitchOp) {
    return generateSwitchTerminal(terminal, functionIR, generator);
  } else if (terminal instanceof TryOp) {
    return generateTryTerminal(terminal, functionIR, generator);
  }

  throw new Error(`Unsupported terminal type: ${terminal.constructor.name}`);
}
