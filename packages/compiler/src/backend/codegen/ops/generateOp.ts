import * as t from "@babel/types";
import {
  ArrayDestructureOp,
  Operation,
  DebuggerStatementOp,
  DeclareLocalOp,
  ExportSpecifierOp,
  ImportSpecifierOp,
  ObjectDestructureOp,
  SpreadElementOp,
  StoreContextOp,
  StoreLocalOp,
} from "../../../ir";
import {
  isDeclarationOp,
  isJSXOp,
  isMemoryOp,
  isModuleOp,
  isPatternOp,
  isValueOp,
} from "../../../ir/categories";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { ClassDeclarationOp } from "../../../ir/ops/class/ClassDeclaration";
import { FunctionDeclarationOp } from "../../../ir/ops/func/FunctionDeclaration";
import { CodeGenerator } from "../../CodeGenerator";
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
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  if (instruction instanceof DebuggerStatementOp) {
    return [generateDebuggerStatementOp(instruction, generator)];
  } else if (isDeclarationOp(instruction)) {
    const statement = generateDeclarationOp(instruction, generator);
    if (
      (instruction instanceof FunctionDeclarationOp || instruction instanceof ClassDeclarationOp) &&
      !instruction.emit
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
      (instruction instanceof ArrayDestructureOp ||
        instruction instanceof ObjectDestructureOp ||
        instruction instanceof StoreLocalOp ||
        instruction instanceof StoreContextOp) &&
      instruction.emit
    ) {
      return [statement as t.Statement];
    }

    // Flush zero-use side-effecting memory instructions (e.g.
    // StoreStaticProperty) as expression statements.
    if (
      instruction.place.identifier.uses.size === 0 &&
      instruction.hasSideEffects(generator.moduleIR.environment) &&
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
    const node = generateValueOp(instruction, functionIR, generator);
    // Flush side-effecting values with zero uses as expression statements.
    // This replaces ExpressionStatementInstruction — the emission decision
    // is based on the use graph, not a wrapper instruction type.
    if (
      instruction.place.identifier.uses.size === 0 &&
      instruction.hasSideEffects(generator.moduleIR.environment) &&
      node !== null &&
      t.isExpression(node)
    ) {
      return [t.expressionStatement(node)];
    }
    return [];
  }

  throw new Error(`Unsupported instruction type: ${instruction.constructor.name}`);
}
