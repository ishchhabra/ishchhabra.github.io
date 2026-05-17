import { CatchClause, TryStatement } from "oxc-parser";

import { BasicBlock } from "../../ir/core/Block";
import { blockTarget, producedOperands } from "../../ir/core/TerminatorOp";
import { Value } from "../../ir/core/Value";
import { InitializeBindingOp } from "../../ir/ops/bindings/InitializeBindingOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { TryTerminatorOp } from "../../ir/ops/control/TryTerminatorOp";
import { DestructureBindingOp } from "../../ir/ops/patterns/DestructureBindingOp";
import { lowerDeclarationInstantiation } from "../declarations/lowerDeclarationInstantiation";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerBindingPatternTarget } from "../patterns/lowerBindingPatternTarget";
import { lowerStatement } from "./lowerStatement";

/**
 * Lowers `try` statements to structured protected, catch, finally, and exit blocks.
 */
export function lowerTryStatement(builder: FunctionIRBuilder, statement: TryStatement): void {
  if (statement.handler === null && statement.finalizer === null) {
    throw new Error("TryStatement requires catch or finally");
  }

  const tryBlock = builder.createBlock();
  const catchBlock = statement.handler === null ? null : builder.createBlock();
  const finallyBlock = statement.finalizer === null ? null : builder.createBlock();
  const completionBlock = builder.createBlock();

  const exceptionValue = catchBlock === null ? null : builder.createValue();

  if (exceptionValue !== null && catchBlock !== null) {
    catchBlock.appendParam(exceptionValue);
  }

  builder.terminate(
    new TryTerminatorOp(
      builder.operationId(),
      blockTarget(tryBlock),
      catchBlock === null
        ? null
        : {
            block: catchBlock,
            operands: producedOperands([exceptionValue!]),
          },
      finallyBlock === null ? null : blockTarget(finallyBlock),
      blockTarget(completionBlock),
    ),
  );

  builder.setCurrentBlock(tryBlock);
  lowerDeclarationInstantiation(builder, statement.block);
  for (const child of statement.block.body) {
    if (builder.currentBlock.isTerminated) break;

    lowerStatement(builder, child);
  }
  jumpIfOpen(builder, finallyBlock ?? completionBlock);

  if (statement.handler !== null && catchBlock !== null) {
    lowerCatchClause(builder, statement.handler, catchBlock, exceptionValue!);
    jumpIfOpen(builder, finallyBlock ?? completionBlock);
  }

  if (statement.finalizer !== null && finallyBlock !== null) {
    builder.setCurrentBlock(finallyBlock);
    lowerDeclarationInstantiation(builder, statement.finalizer);
    for (const child of statement.finalizer.body) {
      if (builder.currentBlock.isTerminated) break;

      lowerStatement(builder, child);
    }
    jumpIfOpen(builder, completionBlock);
  }

  builder.setCurrentBlock(completionBlock);
}

function lowerCatchClause(
  builder: FunctionIRBuilder,
  clause: CatchClause,
  catchBlock: BasicBlock,
  exceptionValue: Value,
): void {
  builder.setCurrentBlock(catchBlock);
  lowerDeclarationInstantiation(builder, clause.body);

  if (clause.param !== null) {
    if (clause.param.type === "Identifier") {
      const declaration = builder.declarationForBinding(clause.param);
      builder.emit(
        new InitializeBindingOp(
          builder.operationId(),
          declaration.id,
          exceptionValue,
          builder.createValue(declaration.id),
        ),
      );
    } else {
      builder.emit(
        new DestructureBindingOp(
          builder.operationId(),
          lowerBindingPatternTarget(builder, clause.param),
          exceptionValue,
          "initialize",
        ),
      );
    }
  }

  for (const child of clause.body.body) {
    if (builder.currentBlock.isTerminated) break;

    lowerStatement(builder, child);
  }
}

function jumpIfOpen(
  builder: FunctionIRBuilder,
  target: ReturnType<FunctionIRBuilder["createBlock"]>,
): void {
  if (!builder.currentBlock.isTerminated) {
    builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(target)));
  }
}
