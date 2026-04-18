import { Operation, ValueId } from "../../ir";
import { FuncOp } from "../../ir/core/FuncOp";
import { Value } from "../../ir/core/Value";
import { FunctionDeclarationOp } from "../../ir/ops/func/FunctionDeclaration";
import { ArrowFunctionExpressionOp } from "../../ir/ops/func/ArrowFunctionExpression";
import { FunctionExpressionOp } from "../../ir/ops/func/FunctionExpression";
import { BaseOptimizationPass, OptimizationResult } from "../late-optimizer/OptimizationPass";

type FunctionBearingInstruction =
  | FunctionDeclarationOp
  | ArrowFunctionExpressionOp
  | FunctionExpressionOp;

function getFunctionBearingFields(
  instr: Operation,
): { funcOp: FuncOp; captures: Value[] } | undefined {
  if (
    instr instanceof FunctionDeclarationOp ||
    instr instanceof ArrowFunctionExpressionOp ||
    instr instanceof FunctionExpressionOp
  ) {
    return { funcOp: instr.funcOp, captures: instr.captures };
  }
  return undefined;
}

function rebuildWithCaptures(instr: FunctionBearingInstruction, newCaptures: Value[]): Operation {
  if (instr instanceof FunctionDeclarationOp) {
    return new FunctionDeclarationOp(
      instr.id,
      instr.place,
      instr.funcOp,
      instr.generator,
      instr.async,
      newCaptures,
    );
  } else if (instr instanceof ArrowFunctionExpressionOp) {
    return new ArrowFunctionExpressionOp(
      instr.id,
      instr.place,
      instr.funcOp,
      instr.async,
      instr.expression,
      instr.generator,
      newCaptures,
    );
  } else {
    return new FunctionExpressionOp(
      instr.id,
      instr.place,
      instr.binding,
      instr.funcOp,
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
 * outer-scope Value is still listed in `captures` but the corresponding
 * `captureParam` inside the inner FuncOp has no readers.
 *
 * This pass reconciles the two: for each function-bearing instruction, it
 * checks which captureParams are actually read inside the inner function
 * body (via the embedded {@link Value.uses} chain), and removes capture/captureParam
 * pairs that are dead.
 */
export class CapturePruningPass extends BaseOptimizationPass {
  constructor(protected readonly funcOp: FuncOp) {
    super(funcOp);
  }

  protected step(): OptimizationResult {
    let changed = false;

    for (const block of this.funcOp.allBlocks()) {
      for (const instr of block.operations) {
        const fields = getFunctionBearingFields(instr);
        if (!fields || fields.captures.length === 0) {
          continue;
        }

        const { funcOp: innerFuncOp, captures } = fields;

        // Check prologue reads (parameter bindings / lowered setup) —
        // these are not in blocks, so the embedded use-chains don't cover them.
        const headerReadIds = new Set<ValueId>();
        for (const headerInstr of innerFuncOp.prologue) {
          for (const place of headerInstr.getOperands()) {
            headerReadIds.add(place.id);
          }
        }

        const isRead = (id: ValueId): boolean => headerReadIds.has(id);

        // Determine which capture slots are still live.
        const captureParams = innerFuncOp.captureParams;
        const liveIndices: number[] = [];
        for (let j = 0; j < captureParams.length; j++) {
          const param = captureParams[j];
          if (param.useCount > 0 || isRead(param.id)) {
            liveIndices.push(j);
          }
        }

        if (liveIndices.length === captureParams.length) {
          continue; // All captures are live — nothing to prune.
        }

        // Rebuild captures and captureParams with only the live slots.
        const newCaptures = liveIndices.map((j) => captures[j]);
        const newCaptureParams = liveIndices.map((j) => captureParams[j]);

        block.replaceOp(
          instr,
          rebuildWithCaptures(instr as FunctionBearingInstruction, newCaptures),
        );

        // Update captureParams on the inner FuncOp to match. Assigning
        // a fresh readonly array replaces the old list in one shot
        // rather than mutating it element-by-element. See 3.7 in the
        // migration status — this cast is the one remaining place the
        // "captureParams is per-function immutable" invariant is
        // intentionally punctured.
        (innerFuncOp as { captureParams: readonly Value[] }).captureParams = newCaptureParams;

        changed = true;
      }
    }

    return { changed };
  }
}
