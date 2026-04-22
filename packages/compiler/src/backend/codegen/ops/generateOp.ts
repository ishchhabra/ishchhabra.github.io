import * as t from "@babel/types";
import {
  ArrayDestructureOp,
  BreakOp,
  ConditionOp,
  ContinueOp,
  DebuggerStatementOp,
  DeclareLocalOp,
  ExportSpecifierOp,
  ForInTerm,
  ForOfTerm,
  ForTerm,
  IfTerm,
  ImportSpecifierOp,
  JumpOp,
  LabeledTerm,
  ObjectDestructureOp,
  Operation,
  ReturnOp,
  SpreadElementOp,
  StoreContextOp,
  StoreLocalOp,
  SwitchTerm,
  ThrowOp,
  TryTerm,
  WhileTerm,
  YieldOp,
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
import { Trait } from "../../../ir/core/Operation";
import { ClassDeclarationOp } from "../../../ir/ops/class/ClassDeclaration";
import { FunctionDeclarationOp } from "../../../ir/ops/func/FunctionDeclaration";
import { CodeGenerator } from "../../CodeGenerator";
import { generateStructure } from "../structures/generateStructure";
import { generateBreakTerminal } from "../terminals/generateBreak";
import {
  generateForInTerm,
  generateForOfTerm,
  generateForTerm,
  generateIfTerm,
  generateLabeledTerm,
  generateSwitchTerm,
  generateTryTerm,
  generateWhileTerm,
} from "../terminals/generateCFGTerminators";
import { generateContinueTerminal } from "../terminals/generateContinue";
import { generateJumpTerminal } from "../terminals/generateJump";
import { generateReturnTerminal } from "../terminals/generateReturn";
import { generateThrowTerminal } from "../terminals/generateThrow";
import { generateDeclarationOp } from "./declaration/generateDeclaration";
import { generateDebuggerStatementOp } from "./generateDebuggerStatement";
import { generateJSXOp } from "./jsx/generateJSX";
import { generateDeclareLocalOp } from "./memory/generateDeclareLocal";
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
  // Terminators are just ops with `Trait.Terminator`. Uniform
  // dispatch through this single entrypoint.
  if (instruction.hasTrait(Trait.Terminator)) {
    if (instruction instanceof YieldOp || instruction instanceof ConditionOp) {
      // YieldOp / ConditionOp end a structured op's region — they
      // produce no statements on their own. The enclosing structured
      // op's emitter reads the yielded / condition values and binds
      // them appropriately (result places for YieldOp, JS while/for
      // test for ConditionOp).
      return [];
    }
    if (instruction instanceof BreakOp) {
      return generateBreakTerminal(instruction);
    }
    if (instruction instanceof ContinueOp) {
      return generateContinueTerminal(instruction);
    }
    if (instruction instanceof JumpOp) {
      return generateJumpTerminal(instruction, funcOp, generator);
    }
    if (instruction instanceof ReturnOp) {
      return generateReturnTerminal(instruction, generator);
    }
    if (instruction instanceof ThrowOp) {
      return generateThrowTerminal(instruction, generator);
    }
    if (instruction instanceof IfTerm) {
      return generateIfTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof WhileTerm) {
      return generateWhileTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof ForTerm) {
      return generateForTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof ForOfTerm) {
      return generateForOfTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof ForInTerm) {
      return generateForInTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof TryTerm) {
      return generateTryTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof SwitchTerm) {
      return generateSwitchTerm(instruction, funcOp, generator);
    }
    if (instruction instanceof LabeledTerm) {
      return generateLabeledTerm(instruction, funcOp, generator);
    }
    throw new Error(`Unsupported terminator op: ${instruction.constructor.name}`);
  }
  // Structured control-flow ops (IfOp, WhileOp, BlockOp, ForInOp,
  // ForOfOp, LabeledBlockOp, SwitchOp, TryOp) live inline in the
  // block's op stream.
  if (instruction.hasTrait(Trait.HasRegions)) {
    return generateStructure(instruction, funcOp, generator);
  }
  if (instruction instanceof DebuggerStatementOp) {
    return [generateDebuggerStatementOp(instruction, generator)];
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
  } else if (instruction instanceof DeclareLocalOp) {
    generateDeclareLocalOp(instruction, generator);
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
      instruction.place.uses.size === 0 &&
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
      instruction.place.uses.size === 0 &&
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
    for (const operand of cur.getOperands()) {
      const def = operand.definer;
      if (def instanceof Operation) stack.push(def);
    }
  }
  return false;
}
