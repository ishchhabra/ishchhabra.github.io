import * as t from "@babel/types";
import { BlockId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { CodeGenerator } from "../CodeGenerator";
import { generateBackEdge } from "./generateBackEdge";
import { generateInstruction } from "./instructions/generateInstruction";
import { generateStructure } from "./structures/generateStructure";
import { generateTerminal } from "./terminals/generateTerminal";

export function generateBlock(
  blockId: BlockId,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  if (generator.generatedBlocks.has(blockId)) {
    // Some blocks are referenced from multiple code paths (e.g. the update
    // block in a `for` loop is reached by both the normal body fall-through
    // and any `continue` statements). Return cloned cached statements so
    // the block's code is correctly inlined at each reference site.
    // Safe because back-edge blocks (loop headers) return early from
    // generateBasicBlock before blockToStatements is set, so they will
    // never be duplicated here.
    const cached = generator.blockToStatements.get(blockId);
    if (cached !== undefined && cached.length > 0) {
      return cached.map((stmt) => t.cloneNode(stmt, true));
    }
    return [];
  }

  generator.generatedBlocks.add(blockId);

  const block = functionIR.blocks.get(blockId);
  if (block === undefined) {
    throw new Error(`Block ${blockId} not found`);
  }

  const statements = generateBasicBlock(blockId, functionIR, generator);
  generator.blockToStatements.set(blockId, statements);
  return statements;
}

export function generateBasicBlock(
  blockId: BlockId,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  const block = functionIR.blocks.get(blockId);
  if (block === undefined) {
    throw new Error(`Block ${blockId} not found`);
  }

  const statements: Array<t.Statement> = [];

  const structure = functionIR.structures.get(blockId);
  if (structure) {
    statements.push(...generateStructure(structure, functionIR, generator));
    generator.blockToStatements.set(blockId, statements);
    return statements;
  }

  for (const instruction of block.instructions) {
    statements.push(...generateInstruction(instruction, functionIR, generator));
  }

  if (generator.getLoopInfo(functionIR).getBackEdgePredecessors(blockId).size > 0) {
    return generateBackEdge(blockId, functionIR, generator);
  }

  const terminal = block.terminal;
  if (terminal !== undefined) {
    statements.push(...generateTerminal(terminal, functionIR, generator));
  }

  generator.blockToStatements.set(blockId, statements);
  return statements;
}
