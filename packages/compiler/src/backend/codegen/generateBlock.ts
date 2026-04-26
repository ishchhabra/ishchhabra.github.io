import * as t from "@babel/types";
import { BlockId } from "../../ir";
import { incomingProducedValues } from "../../ir/cfg";
import { FuncOp } from "../../ir/core/FuncOp";
import { CodeGenerator } from "../CodeGenerator";
import { generateOp } from "./ops/generateOp";

/**
 * Walk a basic block's op stream and emit JS statements for each op,
 * uniformly. Every op — regular instruction, structured op, or
 * terminator — flows through {@link generateOp}, which routes by
 * trait. There is no separate "structure" or "terminator" phase:
 * structured ops live inline in `_ops` and produce their JS
 * statements at their position in the sequence.
 */
export function generateBlock(
  blockId: BlockId,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  if (generator.generatedBlocks.has(blockId)) {
    const cached = generator.blockToStatements.get(blockId);
    if (cached !== undefined && cached.length > 0) {
      return cached.map((stmt) => t.cloneNode(stmt, true));
    }
    return [];
  }

  generator.generatedBlocks.add(blockId);

  const statements = generateBasicBlock(blockId, funcOp, generator);
  generator.blockToStatements.set(blockId, statements);
  return statements;
}

export function generateBasicBlock(
  blockId: BlockId,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const block = funcOp.blocks.find((candidate) => candidate.id === blockId);
  if (block === undefined) {
    throw new Error(`Block ${blockId} not found`);
  }

  // Pre-register values produced by entering this block through a
  // structured-control successor, such as for-of iteration values or
  // catch parameters. No op inside the block defines them.
  for (const value of incomingProducedValues(funcOp, block)) {
    if (!generator.values.has(value.id)) {
      generator.getPlaceIdentifier(value);
    }
  }

  const statements: Array<t.Statement> = [];
  for (const op of block.getAllOps()) {
    statements.push(...generateOp(op, funcOp, generator));
  }

  generator.blockToStatements.set(blockId, statements);
  return statements;
}
