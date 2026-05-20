import type { ForInStatement, ForStatementLeft, VariableDeclaration } from "oxc-parser";

import { blockTarget, producedOperands } from "../../ir/core/TerminatorOp";
import type { Value } from "../../ir/core/Value";
import { InitializeBindingOp } from "../../ir/ops/bindings/InitializeBindingOp";
import { StoreBindingOp } from "../../ir/ops/bindings/StoreBindingOp";
import { ForInTerminatorOp } from "../../ir/ops/control/ForInTerminatorOp";
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
 * Lowers `for...in` to structured property-enumeration control flow.
 *
 * The object expression is evaluated once before the loop. Each successful
 * enumeration step enters the body with one produced value representing the
 * current property key.
 */
export function lowerForInStatement(
  builder: FunctionIRBuilder,
  statement: ForInStatement,
  options: StatementLoweringOptions = {},
): void {
  lowerDeclarationInstantiation(builder, statement);

  const loopBlock = builder.createBlock();
  const bodyBlock = builder.createBlock();
  const continuationBlock = builder.createBlock();

  const propertyKey = builder.createValue();
  bodyBlock.appendParam(propertyKey);

  builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(loopBlock)));

  builder.setCurrentBlock(loopBlock);
  const object = lowerExpression(builder, statement.right);
  const loopHeaderBlock = builder.currentBlock;
  let loopContinueTarget = blockTarget(loopHeaderBlock);
  if (loopHeaderBlock.params.length !== 0) {
    if (loopHeaderBlock.params.length !== 1 || loopHeaderBlock.params[0] !== object) {
      throw new Error("for-in object header must be parameterized by the object result");
    }

    loopContinueTarget = blockTarget(loopHeaderBlock, [object]);
  }

  const control = {
    kind: "loop" as const,
    label: options.label ?? null,
    breakTarget: continuationBlock,
    continueTarget: loopContinueTarget,
  };

  builder.terminate(
    new ForInTerminatorOp(
      builder.operationId(),
      object,
      {
        block: bodyBlock,
        operands: producedOperands([propertyKey]),
      },
      blockTarget(continuationBlock),
      continuationBlock,
      options.label ?? null,
    ),
  );

  builder.pushControl(control);
  try {
    builder.setCurrentBlock(bodyBlock);
    lowerForInLeft(builder, statement.left, propertyKey);
    lowerStatement(builder, statement.body);
  } finally {
    builder.popControl(control);
  }

  if (!builder.currentBlock.isTerminated) {
    builder.terminate(new JumpTerminatorOp(builder.operationId(), loopContinueTarget));
  }

  builder.setCurrentBlock(continuationBlock);
}

function lowerForInLeft(
  builder: FunctionIRBuilder,
  left: ForStatementLeft,
  propertyKey: Value,
): void {
  if (left.type === "VariableDeclaration") {
    lowerForInDeclaration(builder, left, propertyKey);
    return;
  }

  if (left.type === "Identifier") {
    const declaration = builder.declarationForReference(left);
    builder.emit(
      new StoreBindingOp(
        builder.operationId(),
        declaration.id,
        propertyKey,
        builder.createValue(declaration.id),
      ),
    );
    return;
  }

  if (left.type === "MemberExpression") {
    const reference = lowerMemberReference(builder, left);
    builder.emit(
      new StorePropertyOp(builder.operationId(), reference.object, reference.key, propertyKey),
    );
    return;
  }

  if (left.type === "ArrayPattern" || left.type === "ObjectPattern") {
    builder.emit(
      new DestructureAssignmentOp(
        builder.operationId(),
        lowerAssignmentPatternTarget(builder, left),
        propertyKey,
        builder.createValue(),
      ),
    );
    return;
  }

  throw new Error(`Unsupported for-in assignment target: ${left.type}`);
}

function lowerForInDeclaration(
  builder: FunctionIRBuilder,
  declaration: VariableDeclaration,
  value: Value,
): void {
  if (declaration.declarations.length !== 1) {
    throw new Error("for-in declaration must have exactly one declarator");
  }

  const declarator = declaration.declarations[0];

  if (declarator.init !== null) {
    throw new Error("for-in declarations cannot have initializers");
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

  throw new Error(`Unsupported for-in declaration kind: ${declaration.kind}`);
}
