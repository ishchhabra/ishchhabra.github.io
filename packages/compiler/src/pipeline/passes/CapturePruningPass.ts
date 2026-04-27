import { Operation } from "../../ir";
import { FuncOp } from "../../ir/core/FuncOp";
import { Value } from "../../ir/core/Value";
import { FunctionDeclarationOp } from "../../ir/ops/func/FunctionDeclaration";
import { ArrowFunctionExpressionOp } from "../../ir/ops/func/ArrowFunctionExpression";
import { FunctionExpressionOp } from "../../ir/ops/func/FunctionExpression";
import { FunctionPassBase } from "../FunctionPassBase";
import type { PassResult } from "../PassManager";

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
      instr.name,
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
 * capture param inside the inner FuncOp has no readers.
 *
 * This pass reconciles the two: for each function-bearing instruction, it
 * checks which capture params are actually read inside the inner function
 * body (via the embedded {@link Value.users} chain), and removes capture/captureParam
 * pairs that are dead.
 */
export class CapturePruningPass extends FunctionPassBase {
  constructor(protected readonly funcOp: FuncOp) {
    super(funcOp);
  }

  protected step(): PassResult {
    let changed = false;

    for (const block of this.funcOp.blocks) {
      for (const instr of block.operations) {
        const fields = getFunctionBearingFields(instr);
        if (!fields || fields.captures.length === 0) {
          continue;
        }

        const { funcOp: innerFuncOp, captures } = fields;

        // Determine which capture slots are still live.
        const captureParams = innerFuncOp.params.filter((param) => param.kind === "capture");
        const liveIndices: number[] = [];
        for (let j = 0; j < captureParams.length; j++) {
          const param = captureParams[j].value;
          if (param.users.size > 0) {
            liveIndices.push(j);
          }
        }

        if (liveIndices.length === captureParams.length) {
          continue; // All captures are live — nothing to prune.
        }

        // Rebuild captures and capture params with only the live slots.
        const newCaptures = liveIndices.map((j) => captures[j]);
        const newCaptureParams = liveIndices.map((j) => captureParams[j]);

        block.replaceOp(
          instr,
          rebuildWithCaptures(instr as FunctionBearingInstruction, newCaptures),
        );

        innerFuncOp.replaceParams([
          ...innerFuncOp.params.filter((param) => param.kind !== "capture"),
          ...newCaptureParams,
        ]);

        changed = true;
      }
    }

    return { changed };
  }
}
