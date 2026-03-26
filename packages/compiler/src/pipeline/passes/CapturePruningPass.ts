import { BaseInstruction, IdentifierId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { Place } from "../../ir/core/Place";
import { ArrowFunctionExpressionInstruction } from "../../ir/instructions/value/ArrowFunctionExpression";
import { FunctionDeclarationInstruction } from "../../ir/instructions/declaration/Function";
import { FunctionExpressionInstruction } from "../../ir/instructions/value/FunctionExpression";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { DefUseAnalysis } from "../analysis/DefUseAnalysis";
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
 * body (via the cached DefUseAnalysis), and removes capture/captureParam
 * pairs that are dead.
 */
export class CapturePruningPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly AM: AnalysisManager,
  ) {
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

        // Use the cached DefUseAnalysis for the inner function to check
        // which captureParams are actually read.
        const innerDefUse = this.AM.get(DefUseAnalysis, innerFunctionIR);

        // Also check header reads (parameter bindings) — these are not
        // in blocks, so DefUseAnalysis doesn't cover them.
        const headerReadIds = new Set<IdentifierId>();
        for (const headerInstr of innerFunctionIR.header) {
          for (const place of headerInstr.getReadPlaces()) {
            headerReadIds.add(place.identifier.id);
          }
        }

        // Also check structure reads.
        const structureReadIds = new Set<IdentifierId>();
        for (const structure of innerFunctionIR.structures.values()) {
          for (const place of structure.getReadPlaces()) {
            structureReadIds.add(place.identifier.id);
          }
        }

        const isRead = (id: IdentifierId): boolean =>
          innerDefUse.isUsed(id) || headerReadIds.has(id) || structureReadIds.has(id);

        // Determine which capture slots are still live.
        const captureParams = innerFunctionIR.captureParams;
        const liveIndices: number[] = [];
        for (let j = 0; j < captureParams.length; j++) {
          if (isRead(captureParams[j].identifier.id)) {
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

    if (changed) {
      this.AM.invalidateFunction(this.functionIR);
    }

    return { changed };
  }
}
