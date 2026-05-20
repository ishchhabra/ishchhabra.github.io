import type { ForOfStatement, ForStatementLeft, VariableDeclaration } from "oxc-parser";

import { blockTarget, producedOperands } from "../../ir/core/TerminatorOp";
import type { Value } from "../../ir/core/Value";
import { InitializeBindingOp } from "../../ir/ops/bindings/InitializeBindingOp";
import { StoreBindingOp } from "../../ir/ops/bindings/StoreBindingOp";
import { ForOfTerminatorOp } from "../../ir/ops/control/ForOfTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { DestructureAssignmentOp } from "../../ir/ops/patterns/DestructureAssignmentOp";
import { DestructureBindingOp } from "../../ir/ops/patterns/DestructureBindingOp";
import { StorePropertyOp } from "../../ir/ops/properties/StorePropertyOp";
import { lowerDeclarationInstantiation } from "../declarations/lowerDeclarationInstantiation";
import { lowerExpression } from "../expressions/lowerExpression";
import { lowerMemberReference } from "../expressions/lowerMemberExpression";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerAssignmentPatternTarget } from "../patterns/lowerAssignmentPatternTarget";
import { lowerBindingPatternTarget } from "../patterns/lowerBindingPatternTarget";
import { StatementLoweringOptions } from "./loweringOptions";
import { lowerStatement } from "./lowerStatement";

/**
 * Lowers `for...of` to structured iteration control flow.
 *
 * The iterable expression is evaluated once before the loop. Each successful
 * iterator step enters the body with one produced value representing the
 * current iteration value.
 */
export function lowerForOfStatement(
  builder: FunctionIRBuilder,
  statement: ForOfStatement,
  options: StatementLoweringOptions = {},
): void {
  lowerDeclarationInstantiation(builder, statement);

  const loopBlock = builder.createBlock();
  const bodyBlock = builder.createBlock();
  const continuationBlock = builder.createBlock();

  const loopIterable = builder.createValue();
  loopBlock.appendParam(loopIterable);

  const iterationValue = builder.createValue();
  bodyBlock.appendParam(iterationValue);

  const iterable = lowerExpression(builder, statement.right);
  builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(loopBlock, [iterable])));

  const loopContinueTarget = blockTarget(loopBlock, [loopIterable]);

  const control = {
    kind: "loop" as const,
    label: options.label ?? null,
    breakTarget: continuationBlock,
    continueTarget: loopContinueTarget,
  };

  builder.setCurrentBlock(loopBlock);
  builder.terminate(
    new ForOfTerminatorOp(
      builder.operationId(),
      loopIterable,
      {
        block: bodyBlock,
        operands: producedOperands([iterationValue]),
      },
      blockTarget(continuationBlock),
      continuationBlock,
      statement.await,
      options.label ?? null,
    ),
  );

  builder.pushControl(control);
  try {
    builder.setCurrentBlock(bodyBlock);
    lowerForOfLeft(builder, statement.left, iterationValue);
    lowerStatement(builder, statement.body);
  } finally {
    builder.popControl(control);
  }

  if (!builder.currentBlock.isTerminated) {
    builder.terminate(new JumpTerminatorOp(builder.operationId(), loopContinueTarget));
  }

  builder.setCurrentBlock(continuationBlock);
}

function lowerForOfLeft(
  builder: FunctionIRBuilder,
  left: ForStatementLeft,
  iterationValue: Value,
): void {
  if (left.type === "VariableDeclaration") {
    lowerForOfDeclaration(builder, left, iterationValue);
    return;
  }

  if (left.type === "Identifier") {
    const declaration = builder.declarationForReference(left);
    builder.emit(
      new StoreBindingOp(
        builder.operationId(),
        declaration.id,
        iterationValue,
        builder.createValue(declaration.id),
      ),
    );
    return;
  }

  if (left.type === "MemberExpression") {
    const reference = lowerMemberReference(builder, left);
    builder.emit(
      new StorePropertyOp(builder.operationId(), reference.object, reference.key, iterationValue),
    );
    return;
  }

  if (left.type === "ArrayPattern" || left.type === "ObjectPattern") {
    builder.emit(
      new DestructureAssignmentOp(
        builder.operationId(),
        lowerAssignmentPatternTarget(builder, left),
        iterationValue,
        builder.createValue(),
      ),
    );
    return;
  }

  throw new Error(`Unsupported for-of assignment target: ${left.type}`);
}

function lowerForOfDeclaration(
  builder: FunctionIRBuilder,
  declaration: VariableDeclaration,
  value: Value,
): void {
  if (declaration.declarations.length !== 1) {
    throw new Error("for-of declaration must have exactly one declarator");
  }

  const declarator = declaration.declarations[0];

  if (declarator.init !== null) {
    throw new Error("for-of declarations cannot have initializers");
  }

  if (declarator.id.type !== "Identifier") {
    builder.emit(
      new DestructureBindingOp(
        builder.operationId(),
        lowerBindingPatternTarget(builder, declarator.id),
        value,
        declaration.kind === "var" ? "store" : "initialize",
      ),
    );
    return;
  }

  if (declaration.kind === "var") {
    const declarationRecord = builder.declarationForBinding(declarator.id);
    builder.emit(
      new StoreBindingOp(
        builder.operationId(),
        declarationRecord.id,
        value,
        builder.createValue(declarationRecord.id),
      ),
    );
    return;
  }

  if (declaration.kind === "let" || declaration.kind === "const") {
    const declarationRecord = builder.declarationForBinding(declarator.id);
    builder.emit(
      new InitializeBindingOp(
        builder.operationId(),
        declarationRecord.id,
        value,
        builder.createValue(declarationRecord.id),
      ),
    );
    return;
  }

  throw new Error(`Unsupported for-of declaration kind: ${declaration.kind}`);
}
