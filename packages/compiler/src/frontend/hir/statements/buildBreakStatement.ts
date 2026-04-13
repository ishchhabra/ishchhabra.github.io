import type { BreakStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { BreakOp, JumpOp, createOperationId } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildBreakStatement(
  node: BreakStatement,
  functionBuilder: FunctionIRBuilder,
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

  // Structured constructs (BlockOp/LabeledBlockOp/ForOf/ForIn) get a
  // structural BreakOp; flat constructs (while/for/do-while/switch)
  // still use a raw JumpOp targeting the exit block — there is no
  // enclosing structured op for the CFG analyzer to walk up to.
  functionBuilder.currentBlock.terminal = ctx.structured
    ? new BreakOp(createOperationId(environment), label)
    : new JumpOp(createOperationId(environment), ctx.breakTarget);

  return undefined;
}
