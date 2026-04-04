import { BaseInstruction, IdentifierId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { Place } from "../../ir/core/Place";
import { ArrowFunctionExpressionInstruction } from "../../ir/instructions/value/ArrowFunctionExpression";
import { FunctionExpressionInstruction } from "../../ir/instructions/value/FunctionExpression";
import { BaseOptimizationPass, OptimizationResult } from "../late-optimizer/OptimizationPass";

type FunctionBearingInstruction =
  | ArrowFunctionExpressionInstruction
  | FunctionExpressionInstruction;

function getFunctionBearingFields(
  instr: BaseInstruction,
): { functionIR: FunctionIR; captures: Place[] } | undefined {
  if (
    instr instanceof ArrowFunctionExpressionInstruction ||
    instr instanceof FunctionExpressionInstruction
  ) {
    return { functionIR: instr.functionIR, captures: instr.captures };
  }
  return undefined;
}

function rebuildWithCaptures(
  instr: FunctionBearingInstruction,
  newCaptures: Place[],
): BaseInstruction {
  if (instr instanceof ArrowFunctionExpressionInstruction) {
    return new ArrowFunctionExpressionInstruction(
      instr.id,
      instr.place,
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
 * body (via the embedded {@link Identifier.uses} chain), and removes capture/captureParam
 * pairs that are dead.
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

        // Check header reads (parameter bindings) — these are not
        // in blocks, so the embedded use-chains don't cover them.
        const headerReadIds = new Set<IdentifierId>();
        for (const headerInstr of innerFunctionIR.header) {
          for (const place of headerInstr.getOperands()) {
            headerReadIds.add(place.identifier.id);
          }
        }

        // Also check structure reads.
        const structureReadIds = new Set<IdentifierId>();
        for (const structure of innerFunctionIR.structures.values()) {
          for (const place of structure.getOperands()) {
            structureReadIds.add(place.identifier.id);
          }
        }

        const isRead = (id: IdentifierId): boolean =>
          headerReadIds.has(id) || structureReadIds.has(id);

        // Determine which capture slots are still live.
        const captureParams = innerFunctionIR.captureParams;
        const liveIndices: number[] = [];
        for (let j = 0; j < captureParams.length; j++) {
          const param = captureParams[j];
          if (param.identifier.uses.size > 0 || isRead(param.identifier.id)) {
            liveIndices.push(j);
          }
        }

        if (liveIndices.length === captureParams.length) {
          continue; // All captures are live — nothing to prune.
        }

        // Rebuild captures and captureParams with only the live slots.
        const newCaptures = liveIndices.map((j) => captures[j]);
        const newCaptureParams = liveIndices.map((j) => captureParams[j]);

        block.replaceInstruction(
          i,
          rebuildWithCaptures(instr as FunctionBearingInstruction, newCaptures),
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
