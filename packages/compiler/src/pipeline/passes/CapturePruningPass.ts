import { BaseInstruction, IdentifierId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { Place } from "../../ir/core/Place";
import { ArrowFunctionExpressionInstruction } from "../../ir/instructions/value/ArrowFunctionExpression";
import { FunctionDeclarationInstruction } from "../../ir/instructions/declaration/Function";
import { FunctionExpressionInstruction } from "../../ir/instructions/value/FunctionExpression";
import { BaseOptimizationPass, OptimizationResult } from "../late-optimizer/OptimizationPass";

type FunctionBearingInstruction =
  | FunctionDeclarationInstruction
  | ArrowFunctionExpressionInstruction
  | FunctionExpressionInstruction;

function getFunctionBearingFields(
  instr: BaseInstruction,
): { functionIR: FunctionIR; captures: Place[] } | undefined {
  if (
    instr instanceof FunctionDeclarationInstruction ||
    instr instanceof ArrowFunctionExpressionInstruction ||
    instr instanceof FunctionExpressionInstruction
  ) {
    return { functionIR: instr.functionIR, captures: instr.captures };
  }
  return undefined;
}

function rebuildWithCaptures(instr: FunctionBearingInstruction, newCaptures: Place[]): BaseInstruction {
  if (instr instanceof FunctionDeclarationInstruction) {
    return new FunctionDeclarationInstruction(
      instr.id,
      instr.place,
      instr.nodePath,
      instr.identifier,
      instr.functionIR,
      instr.generator,
      instr.async,
      newCaptures,
    );
  } else if (instr instanceof ArrowFunctionExpressionInstruction) {
    return new ArrowFunctionExpressionInstruction(
      instr.id,
      instr.place,
      instr.nodePath,
      instr.functionIR,
      instr.async,
      instr.expression,
      instr.generator,
      newCaptures,
    );
  } else {
    return new FunctionExpressionInstruction(
      instr.id,
      instr.place,
      instr.nodePath,
      instr.identifier,
      instr.functionIR,
      instr.generator,
      instr.async,
      newCaptures,
    );
  }
}

/**
 * Prunes stale captures from function-bearing instructions.
 *
 * After any transformation that modifies a nested function's body (e.g.
 * inlining, constant propagation), a capture slot may become unused — the
 * outer-scope Place is still listed in `captures` but the corresponding
 * `captureParam` inside the inner FunctionIR has no readers.
 *
 * This pass reconciles the two: for each function-bearing instruction, it
 * checks which captureParams are actually read inside the inner function
 * body, and removes capture/captureParam pairs that are dead.
 *
 * This is intentionally not part of the inlining pass or DCE — captures
 * are derived cross-scope metadata that can be invalidated by *any*
 * transformation, so a dedicated reconciliation pass keeps concerns
 * separated and composes with future passes.
 */
export class CapturePruningPass extends BaseOptimizationPass {
  constructor(protected readonly functionIR: FunctionIR) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;

    for (const block of this.functionIR.blocks.values()) {
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];
        const fields = getFunctionBearingFields(instr);
        if (!fields || fields.captures.length === 0) {
          continue;
        }

        const { functionIR: innerFunctionIR, captures } = fields;

        // Collect every identifier read inside the inner function body.
        const readIds = new Set<IdentifierId>();
        for (const innerBlock of innerFunctionIR.blocks.values()) {
          for (const innerInstr of innerBlock.instructions) {
            for (const place of innerInstr.getReadPlaces()) {
              readIds.add(place.identifier.id);
            }
          }
          if (innerBlock.terminal) {
            for (const place of innerBlock.terminal.getReadPlaces()) {
              readIds.add(place.identifier.id);
            }
          }
        }
        for (const structure of innerFunctionIR.structures.values()) {
          for (const place of structure.getReadPlaces()) {
            readIds.add(place.identifier.id);
          }
        }

        // Determine which capture slots are still live.
        const captureParams = innerFunctionIR.captureParams;
        const liveIndices: number[] = [];
        for (let j = 0; j < captureParams.length; j++) {
          if (readIds.has(captureParams[j].identifier.id)) {
            liveIndices.push(j);
          }
        }

        if (liveIndices.length === captureParams.length) {
          continue; // All captures are live — nothing to prune.
        }

        // Rebuild captures and captureParams with only the live slots.
        const newCaptures = liveIndices.map((j) => captures[j]);
        const newCaptureParams = liveIndices.map((j) => captureParams[j]);

        block.instructions[i] = rebuildWithCaptures(
          instr as FunctionBearingInstruction,
          newCaptures,
        );

        // Update captureParams on the inner FunctionIR to match.
        captureParams.length = 0;
        captureParams.push(...newCaptureParams);

        changed = true;
      }
    }

    return { changed };
  }
}
