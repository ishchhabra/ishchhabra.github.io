import * as t from "@babel/types";
import {
  ArrayDestructureOp,
  BindingDeclOp,
  BindingInitOp,
  BranchTermOp,
  DebuggerStatementOp,
  ExportSpecifierOp,
  ForInTermOp,
  ForOfTermOp,
  ForTermOp,
  IfTermOp,
  ImportSpecifierOp,
  JumpTermOp,
  LabeledTermOp,
  ObjectDestructureOp,
  Operation,
  ReturnTermOp,
  SpreadElementOp,
  StoreContextOp,
  StoreLocalOp,
  SwitchTermOp,
  ThrowTermOp,
  TryTermOp,
  WhileTermOp,
} from "../../../ir";
import { isClaimedByExportDeclaration } from "../../../ir/exportClaim";
import {
  isDeclarationOp,
  isJSXOp,
  isMemoryOp,
  isModuleOp,
  isPatternOp,
  isValueOp,
} from "../../../ir/categories";
import { FuncOp } from "../../../ir/core/FuncOp";
import { TermOp } from "../../../ir/core/TermOp";
import { ClassDeclarationOp } from "../../../ir/ops/class/ClassDeclaration";
import { FunctionDeclarationOp } from "../../../ir/ops/func/FunctionDeclaration";
import { CodeGenerator } from "../../CodeGenerator";
import {
  generateBranchTerm,
  generateForInTerm,
  generateForOfTerm,
  generateForTerm,
  generateIfTerm,
  generateLabeledTerm,
  generateSwitchTerm,
  generateTryTerm,
  generateWhileTerm,
} from "../terminals/generateCFGTerminators";
import { generateJumpTerminal } from "../terminals/generateJump";
import { generateReturnTerminal } from "../terminals/generateReturn";
import { generateThrowTerminal } from "../terminals/generateThrow";
import { generateDeclarationOp } from "./declaration/generateDeclaration";
import { generateDebuggerStatementOp } from "./generateDebuggerStatement";
import { generateJSXOp } from "./jsx/generateJSX";
import { generateBindingDeclOp, generateBindingInitOp } from "./memory/generateBindingDecl";
import { generateMemoryOp } from "./memory/generateMemory";
import { generateModuleOp } from "./module/generateModule";
import { generatePatternOp } from "./pattern/generatePattern";
import { generateSpreadElementOp } from "./pattern/generateSpreadElement";
import { generateValueOp } from "./value/generateValue";

export function generateOp(
  instruction: Operation,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  // Terminators extend TermOp. Uniform dispatch through this entrypoint.
  if (instruction instanceof TermOp) {
    if (instruction instanceof JumpTermOp) {
      return generateJumpTerminal(instruction, funcOp, generator);
    }
    if (instruction instanceof ReturnTermOp) {
      return generateReturnTerminal(instruction, generator);
    }
    if (instruction instanceof ThrowTermOp) {
      return generateThrowTerminal(instruction, generator);
    }
    if (instruction instanceof IfTermOp) {
      return generateIfTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof BranchTermOp) {
      return generateBranchTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof WhileTermOp) {
      return generateWhileTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof ForTermOp) {
      return generateForTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof ForOfTermOp) {
      return generateForOfTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof ForInTermOp) {
      return generateForInTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof TryTermOp) {
      return generateTryTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof SwitchTermOp) {
      return generateSwitchTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof LabeledTermOp) {
      return generateLabeledTerm(instruction, funcOp, generator);
    }
    throw new Error(`Unsupported terminator op: ${instruction.constructor.name}`);
  }
  if (instruction instanceof DebuggerStatementOp) {
    return [generateDebuggerStatementOp(instruction, generator)];
  } else if (instruction instanceof BindingDeclOp) {
    const statement = generateBindingDeclOp(instruction, generator);
    return statement === undefined ? [] : [statement];
  } else if (instruction instanceof BindingInitOp) {
    const statement = generateBindingInitOp(instruction, generator);
    return statement === undefined ? [] : [statement];
  } else if (isDeclarationOp(instruction)) {
    const statement = generateDeclarationOp(instruction, generator);
    if (
      (instruction instanceof FunctionDeclarationOp || instruction instanceof ClassDeclarationOp) &&
      isClaimedByExportDeclaration(instruction)
    ) {
      return [];
    }

    return [statement];
  } else if (isJSXOp(instruction)) {
    generateJSXOp(instruction, generator);
    return [];
  } else if (isMemoryOp(instruction)) {
    const statement = generateMemoryOp(instruction, generator);
    if (
      instruction instanceof ArrayDestructureOp ||
      instruction instanceof ObjectDestructureOp ||
      instruction instanceof StoreLocalOp ||
      instruction instanceof StoreContextOp
    ) {
      if (isClaimedByExportDeclaration(instruction)) {
        return [];
      }
      return [statement as t.Statement];
    }

    if (
      instruction.place.users.size === 0 &&
      hasTransitiveSideEffects(instruction, generator.moduleIR.environment) &&
      statement &&
      t.isExpression(statement)
    ) {
      return [t.expressionStatement(statement)];
    }

    return [];
  } else if (isModuleOp(instruction)) {
    const statement = generateModuleOp(instruction, generator);
    if (instruction instanceof ImportSpecifierOp || instruction instanceof ExportSpecifierOp) {
      return [];
    }

    return [statement as t.Statement];
  } else if (isPatternOp(instruction)) {
    generatePatternOp(instruction, generator);
    return [];
  } else if (instruction instanceof SpreadElementOp) {
    generateSpreadElementOp(instruction, generator);
    return [];
  } else if (isValueOp(instruction)) {
    const node = generateValueOp(instruction, funcOp, generator);
    if (
      instruction.place.users.size === 0 &&
      hasTransitiveSideEffects(instruction, generator.moduleIR.environment) &&
      node !== null &&
      t.isExpression(node)
    ) {
      return [t.expressionStatement(node)];
    }
    return [];
  }

  throw new Error(`Unsupported instruction type: ${instruction.constructor.name}`);
}

/**
 * True iff the expression tree rooted at `op` contains at least one
 * op with observable side effects. Used to decide whether an orphan
 * value op (no users) must still be emitted as a standalone
 * expression statement — pure container ops like BinaryExpression
 * don't propagate operand side effects via `hasSideEffects`, so
 * without this check we'd drop `foo() + bar()` entirely when the
 * parent binding was swept.
 */
function hasTransitiveSideEffects(
  op: Operation,
  env: Parameters<Operation["hasSideEffects"]>[0],
): boolean {
  const seen = new Set<Operation>();
  const stack: Operation[] = [op];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (cur.hasSideEffects(env)) return true;
    for (const operand of cur.operands()) {
      const def = operand.def;
      if (def instanceof Operation) stack.push(def);
    }
  }
  return false;
}
