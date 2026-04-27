import type { BreakStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { createOperationId, JumpTermOp, valueBlockTarget } from "../../../ir";
import { FuncOpBuilder } from "../FuncOpBuilder";

export function buildBreakStatement(
  node: BreakStatement,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  const label = node.label?.name;
  const ctx = functionBuilder.getBreakControl(label);
  if (ctx === undefined) {
    throw new Error(
      label
        ? `Labeled break target "${label}" not found`
        : "Break statement outside of switch/loop",
    );
  }

  // Emit as a plain JumpTermOp to the controlStack-tracked breakTarget.
  // Codegen recognizes the jump as a break (via getBreakLabel which
  // consults the generator's control stack) and emits the right JS
  // keyword. SSABuilder's fillJumpArgs handles the target's block
  // params the same as any other edge.
  const targetBlockId = ctx.breakTarget;
  if (targetBlockId === undefined) {
    throw new Error("Break control context missing breakTarget");
  }
  const targetBlock = functionBuilder.maybeBlock(targetBlockId);
  if (targetBlock === undefined) {
    throw new Error(`Break target block ${targetBlockId} not found`);
  }
  functionBuilder.currentBlock.setTerminal(
    new JumpTermOp(createOperationId(environment), valueBlockTarget(targetBlock)),
  );
  return undefined;
}
