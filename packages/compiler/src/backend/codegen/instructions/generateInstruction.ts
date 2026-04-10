import * as t from "@babel/types";
import {
  ArrayDestructureInstruction,
  BaseInstruction,
  DebuggerStatementInstruction,
  DeclarationInstruction,
  DeclareLocalInstruction,
  ExportSpecifierInstruction,
  ImportSpecifierInstruction,
  JSXInstruction,
  MemoryInstruction,
  ModuleInstruction,
  ObjectDestructureInstruction,
  PatternInstruction,
  SpreadElementInstruction,
  StoreContextInstruction,
  StoreLocalInstruction,
  ValueInstruction,
} from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { FunctionDeclarationInstruction } from "../../../ir/instructions/declaration/FunctionDeclaration";
import { CodeGenerator } from "../../CodeGenerator";
import { generateDeclarationInstruction } from "./declaration/generateDeclaration";
import { generateDebuggerStatementInstruction } from "./generateDebuggerStatement";
import { generateJSXInstruction } from "./jsx/generateJSX";
import { generateDeclareLocalInstruction } from "./memory/generateDeclareLocal";
import { generateMemoryInstruction } from "./memory/generateMemory";
import { generateModuleInstruction } from "./module/generateModule";
import { generatePatternInstruction } from "./pattern/generatePattern";
import { generateSpreadElementInstruction } from "./pattern/generateSpreadElement";
import { generateValueInstruction } from "./value/generateValue";

export function generateInstruction(
  instruction: BaseInstruction,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  if (instruction instanceof DebuggerStatementInstruction) {
    return [generateDebuggerStatementInstruction(instruction, generator)];
  } else if (instruction instanceof DeclarationInstruction) {
    const statement = generateDeclarationInstruction(instruction, generator);
    if (instruction instanceof FunctionDeclarationInstruction && !instruction.emit) {
      return [];
    }

    return [statement];
  } else if (instruction instanceof JSXInstruction) {
    generateJSXInstruction(instruction, generator);
    return [];
  } else if (instruction instanceof DeclareLocalInstruction) {
    generateDeclareLocalInstruction(instruction, generator);
    return [];
  } else if (instruction instanceof MemoryInstruction) {
    const statement = generateMemoryInstruction(instruction, generator);
    if (
      (instruction instanceof ArrayDestructureInstruction ||
        instruction instanceof ObjectDestructureInstruction ||
        instruction instanceof StoreLocalInstruction ||
        instruction instanceof StoreContextInstruction) &&
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
  } else if (instruction instanceof ModuleInstruction) {
    const statement = generateModuleInstruction(instruction, generator);
    if (
      instruction instanceof ImportSpecifierInstruction ||
      instruction instanceof ExportSpecifierInstruction
    ) {
      return [];
    }

    return [statement as t.Statement];
  } else if (instruction instanceof PatternInstruction) {
    generatePatternInstruction(instruction, generator);
    return [];
  } else if (instruction instanceof SpreadElementInstruction) {
    generateSpreadElementInstruction(instruction, generator);
    return [];
  } else if (instruction instanceof ValueInstruction) {
    const node = generateValueInstruction(instruction, functionIR, generator);
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
