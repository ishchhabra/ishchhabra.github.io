import { blockTarget, producedOperands } from "../../ir/core/TerminatorOp";
import { ForOfTerminatorOp } from "../../ir/ops/control/ForOfTerminatorOp";
import { lowerExpression } from "../expressions/lowerExpression";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import type {
  ForOfStatement,
  ForStatementLeft,
  VariableDeclaration,
} from "oxc-parser";
import { lowerStatement } from "./lowerStatement";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import type { Value } from "../../ir/core/Value";
import { StoreBindingOp } from "../../ir/ops/bindings/StoreBindingOp";
import { lowerMemberReference } from "../expressions/lowerMemberExpression";
import { StorePropertyOp } from "../../ir/ops/properties/StorePropertyOp";
import { InitializeBindingOp } from "../../ir/ops/bindings/InitializeBindingOp";
import { lowerDeclarationInstantiation } from "../declarations/lowerDeclarationInstantiation";
import { StatementLoweringOptions } from "./loweringOptions";
import { DestructureAssignmentOp } from "../../ir/ops/patterns/DestructureAssignmentOp";
import { DestructureBindingOp } from "../../ir/ops/patterns/DestructureBindingOp";
import { lowerAssignmentPatternTarget } from "../patterns/lowerAssignmentPatternTarget";
import { lowerBindingPatternTarget } from "../patterns/lowerBindingPatternTarget";

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
  if (statement.await) {
    throw new Error("for await...of requires async iterator lowering");
  }

  const iterable = lowerExpression(builder, statement.right);
  lowerDeclarationInstantiation(builder, statement);

  const loopBlock = builder.createBlock();
  const bodyBlock = builder.createBlock();
  const completionBlock = builder.createBlock();

  const control = {
    kind: "loop" as const,
    label: options.label ?? null,
    breakTarget: completionBlock,
    continueTarget: loopBlock,
  };

  const iterationValue = builder.createValue();
  bodyBlock.appendParam(iterationValue);

  builder.terminate(
    new JumpTerminatorOp(builder.operationId(), blockTarget(loopBlock)),
  );

  builder.setCurrentBlock(loopBlock);
  builder.terminate(
    new ForOfTerminatorOp(
      builder.operationId(),
      iterable,
      {
        block: bodyBlock,
        operands: producedOperands([iterationValue]),
      },
      blockTarget(completionBlock),
      completionBlock,
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
    builder.terminate(
      new JumpTerminatorOp(builder.operationId(), blockTarget(loopBlock)),
    );
  }

  builder.setCurrentBlock(completionBlock);
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
      new StorePropertyOp(
        builder.operationId(),
        reference.object,
        reference.key,
        iterationValue,
      ),
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
