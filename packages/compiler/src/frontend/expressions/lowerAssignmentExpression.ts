import type { Value } from "../../ir/core/Value";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import type {
  AssignmentExpression,
  AssignmentOperator,
  IdentifierReference,
  MemberExpression,
} from "oxc-parser";
import { lowerExpression } from "./lowerExpression";
import { StoreBindingOp } from "../../ir/ops/bindings/StoreBindingOp";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
import { lowerIdentifier } from "./lowerIdentifier";
import { BinaryOp, type BinaryOperator } from "../../ir/ops/operators/BinaryOp";
import { StorePropertyOp } from "../../ir/ops/properties/StorePropertyOp";
import { LoadPropertyOp } from "../../ir/ops/properties/LoadPropertyOp";
import {
  lowerMemberPropertyKey,
  lowerPrivateMemberReference,
  lowerMemberReference,
} from "./lowerMemberExpression";
import { LoadPrivatePropertyOp } from "../../ir/ops/properties/LoadPrivatePropertyOp";
import { StorePrivatePropertyOp } from "../../ir/ops/properties/StorePrivatePropertyOp";
import { SuperPropertyOp } from "../../ir/ops/properties/SuperPropertyOp";
import { StoreSuperPropertyOp } from "../../ir/ops/properties/StoreSuperPropertyOp";
import { DestructureAssignmentOp } from "../../ir/ops/patterns/DestructureAssignmentOp";
import { lowerAssignmentPatternTarget } from "../patterns/lowerAssignmentPatternTarget";
import { blockTarget } from "../../ir/core/TerminatorOp";
import { IfTerminatorOp } from "../../ir/ops/control/IfTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";

/**
 * Lowers an ECMAScript assignment expression and returns its completion value.
 *
 * Assignment evaluates the target reference and right-hand side according to
 * ECMAScript evaluation order, performs the write, and produces the assigned
 * value. Compound assignments read the target once, apply the corresponding
 * binary operator, write the computed value, and produce that computed value.
 *
 * Logical assignments are lowered as short-circuiting control flow so the
 * right-hand side is evaluated only when the operator requires assignment.
 */
export function lowerAssignmentExpression(
  builder: FunctionIRBuilder,
  expression: AssignmentExpression,
): Value {
  if (
    expression.left.type === "ArrayPattern" ||
    expression.left.type === "ObjectPattern"
  ) {
    return lowerDestructuringAssignment(builder, expression);
  }

  if (isLogicalAssignmentOperator(expression.operator)) {
    return lowerLogicalAssignmentExpression(builder, expression);
  }

  if (expression.left.type === "MemberExpression") {
    return lowerMemberAssignment(
      builder,
      expression,
      expression.left as MemberExpression,
    );
  }

  if (expression.left.type !== "Identifier") {
    throw new Error(
      "Assignment targets other than identifiers and properties are not supported",
    );
  }

  return lowerIdentifierAssignment(builder, expression, expression.left);
}

/**
 * Lowers `&&=`, `||=`, and `??=` assignment expressions.
 *
 * The target reference is evaluated once. The current target value is used for
 * the short-circuit decision. The right-hand side and write happen only on the
 * assignment path. The expression result is either the original value or the
 * newly assigned value.
 *
 * @example
 * ```js
 * x ||= compute();
 * obj[key] &&= compute();
 * ```
 */
function lowerLogicalAssignmentExpression(
  builder: FunctionIRBuilder,
  expression: AssignmentExpression,
): Value {
  if (expression.left.type === "Identifier") {
    return lowerIdentifierLogicalAssignment(
      builder,
      expression,
      expression.left,
    );
  }

  if (expression.left.type === "MemberExpression") {
    return lowerMemberLogicalAssignment(
      builder,
      expression,
      expression.left as MemberExpression,
    );
  }

  throw new Error(
    `Logical assignment target is not supported: ${expression.left.type}`,
  );
}

function lowerIdentifierLogicalAssignment(
  builder: FunctionIRBuilder,
  expression: AssignmentExpression,
  target: IdentifierReference,
): Value {
  const declaration = builder.declarationForReference(target);
  const current = lowerIdentifier(builder, target);

  return lowerLogicalAssignmentControlFlow(builder, expression, current, () => {
    const value = lowerExpression(builder, expression.right);
    builder.emit(
      new StoreBindingOp(
        builder.operationId(),
        declaration.id,
        value,
        builder.createValue(declaration.id),
      ),
    );
    return value;
  });
}

function lowerMemberLogicalAssignment(
  builder: FunctionIRBuilder,
  expression: AssignmentExpression,
  target: MemberExpression,
): Value {
  if (target.property.type === "PrivateIdentifier") {
    return lowerPrivatePropertyLogicalAssignment(builder, expression, target);
  }

  if (target.object.type === "Super") {
    return lowerSuperPropertyLogicalAssignment(builder, expression, target);
  }

  const reference = lowerMemberReference(builder, target);
  const current = builder.createValue();

  builder.emit(
    new LoadPropertyOp(
      builder.operationId(),
      reference.object,
      reference.key,
      current,
    ),
  );

  return lowerLogicalAssignmentControlFlow(builder, expression, current, () => {
    const value = lowerExpression(builder, expression.right);
    const result = builder.createValue();
    builder.emit(
      new StorePropertyOp(
        builder.operationId(),
        reference.object,
        reference.key,
        value,
        result,
      ),
    );
    return result;
  });
}

function lowerPrivatePropertyLogicalAssignment(
  builder: FunctionIRBuilder,
  expression: AssignmentExpression,
  target: MemberExpression,
): Value {
  const reference = lowerPrivateMemberReference(builder, target);
  const current = builder.createValue();

  builder.emit(
    new LoadPrivatePropertyOp(
      builder.operationId(),
      reference.object,
      reference.name,
      current,
    ),
  );

  return lowerLogicalAssignmentControlFlow(builder, expression, current, () => {
    const value = lowerExpression(builder, expression.right);
    const result = builder.createValue();

    builder.emit(
      new StorePrivatePropertyOp(
        builder.operationId(),
        reference.object,
        reference.name,
        value,
        result,
      ),
    );

    return result;
  });
}

function lowerSuperPropertyLogicalAssignment(
  builder: FunctionIRBuilder,
  expression: AssignmentExpression,
  target: MemberExpression,
): Value {
  const key = lowerMemberPropertyKey(builder, target);
  const current = builder.createValue();

  builder.emit(new SuperPropertyOp(builder.operationId(), key, current));

  return lowerLogicalAssignmentControlFlow(builder, expression, current, () => {
    const value = lowerExpression(builder, expression.right);
    const result = builder.createValue();

    builder.emit(
      new StoreSuperPropertyOp(builder.operationId(), key, value, result),
    );

    return result;
  });
}

function lowerLogicalAssignmentControlFlow(
  builder: FunctionIRBuilder,
  expression: AssignmentExpression,
  current: Value,
  lowerAssignmentPath: () => Value,
): Value {
  const condition = logicalAssignmentCondition(
    builder,
    expression.operator,
    current,
  );

  const assignBlock = builder.createBlock();
  const joinBlock = builder.createBlock();
  const result = builder.createValue();
  joinBlock.appendParam(result);

  const assignTarget = blockTarget(assignBlock);
  const passTarget = blockTarget(joinBlock, [current]);

  builder.terminate(
    expression.operator === "&&="
      ? new IfTerminatorOp(
          builder.operationId(),
          condition,
          assignTarget,
          passTarget,
          joinBlock,
        )
      : new IfTerminatorOp(
          builder.operationId(),
          condition,
          passTarget,
          assignTarget,
          joinBlock,
        ),
  );

  builder.setCurrentBlock(assignBlock);
  const assigned = lowerAssignmentPath();
  if (!builder.currentBlock.isTerminated) {
    builder.terminate(
      new JumpTerminatorOp(
        builder.operationId(),
        blockTarget(joinBlock, [assigned]),
      ),
    );
  }

  builder.setCurrentBlock(joinBlock);
  return result;
}

function logicalAssignmentCondition(
  builder: FunctionIRBuilder,
  operator: AssignmentOperator,
  current: Value,
): Value {
  if (operator !== "??=") return current;

  const nullValue = builder.createValue();
  builder.emit(new ConstantOp(builder.operationId(), null, nullValue));

  const condition = builder.createValue();
  builder.emit(
    new BinaryOp(builder.operationId(), "!=", current, nullValue, condition),
  );

  return condition;
}

function lowerDestructuringAssignment(
  builder: FunctionIRBuilder,
  expression: AssignmentExpression,
): Value {
  if (expression.operator !== "=") {
    throw new Error(
      `Destructuring assignment does not support operator ${expression.operator}`,
    );
  }

  const source = lowerExpression(builder, expression.right);
  const result = builder.createValue();

  builder.emit(
    new DestructureAssignmentOp(
      builder.operationId(),
      lowerAssignmentPatternTarget(builder, expression.left),
      source,
      result,
    ),
  );

  return result;
}

/**
 * Lowers assignment to an object property reference.
 *
 * Property assignment evaluates the object and computed key before the
 * right-hand side, performs the property write, and returns the assigned value.
 * Compound assignment reads the property once, computes the new value, writes
 * it, and returns the computed value.
 */
function lowerMemberAssignment(
  builder: FunctionIRBuilder,
  expression: AssignmentExpression,
  target: MemberExpression,
): Value {
  if (target.property.type === "PrivateIdentifier") {
    return lowerPrivatePropertyAssignment(builder, expression, target);
  }

  if (target.object.type === "Super") {
    return lowerSuperPropertyAssignment(builder, expression, target);
  }

  const reference = lowerMemberReference(builder, target);

  if (expression.operator === "=") {
    const value = lowerExpression(builder, expression.right);
    const result = builder.createValue();
    builder.emit(
      new StorePropertyOp(
        builder.operationId(),
        reference.object,
        reference.key,
        value,
        result,
      ),
    );
    return result;
  }

  const operator = binaryOperatorForAssignment(expression.operator);
  const current = builder.createValue();

  builder.emit(
    new LoadPropertyOp(
      builder.operationId(),
      reference.object,
      reference.key,
      current,
    ),
  );

  const right = lowerExpression(builder, expression.right);
  const computed = builder.createValue();

  builder.emit(
    new BinaryOp(builder.operationId(), operator, current, right, computed),
  );
  const result = builder.createValue();
  builder.emit(
    new StorePropertyOp(
      builder.operationId(),
      reference.object,
      reference.key,
      computed,
      result,
    ),
  );

  return result;
}

function lowerPrivatePropertyAssignment(
  builder: FunctionIRBuilder,
  expression: AssignmentExpression,
  target: MemberExpression,
): Value {
  const reference = lowerPrivateMemberReference(builder, target);

  if (expression.operator === "=") {
    const value = lowerExpression(builder, expression.right);
    const result = builder.createValue();

    builder.emit(
      new StorePrivatePropertyOp(
        builder.operationId(),
        reference.object,
        reference.name,
        value,
        result,
      ),
    );

    return result;
  }

  const operator = binaryOperatorForAssignment(expression.operator);
  const current = builder.createValue();

  builder.emit(
    new LoadPrivatePropertyOp(
      builder.operationId(),
      reference.object,
      reference.name,
      current,
    ),
  );

  const right = lowerExpression(builder, expression.right);
  const computed = builder.createValue();

  builder.emit(
    new BinaryOp(builder.operationId(), operator, current, right, computed),
  );

  const result = builder.createValue();
  builder.emit(
    new StorePrivatePropertyOp(
      builder.operationId(),
      reference.object,
      reference.name,
      computed,
      result,
    ),
  );

  return result;
}

function lowerSuperPropertyAssignment(
  builder: FunctionIRBuilder,
  expression: AssignmentExpression,
  target: MemberExpression,
): Value {
  const key = lowerMemberPropertyKey(builder, target);

  if (expression.operator === "=") {
    const value = lowerExpression(builder, expression.right);
    const result = builder.createValue();

    builder.emit(
      new StoreSuperPropertyOp(builder.operationId(), key, value, result),
    );

    return result;
  }

  const operator = binaryOperatorForAssignment(expression.operator);
  const current = builder.createValue();

  builder.emit(new SuperPropertyOp(builder.operationId(), key, current));

  const right = lowerExpression(builder, expression.right);
  const computed = builder.createValue();

  builder.emit(
    new BinaryOp(builder.operationId(), operator, current, right, computed),
  );

  const result = builder.createValue();
  builder.emit(
    new StoreSuperPropertyOp(builder.operationId(), key, computed, result),
  );

  return result;
}

/**
 * Lowers assignment to a declaration-backed identifier reference.
 *
 * Identifier assignment writes the resolved source binding. Simple assignment
 * returns the right-hand side value; compound assignment returns the computed
 * value after applying the operator to the current binding value and RHS.
 */
function lowerIdentifierAssignment(
  builder: FunctionIRBuilder,
  expression: AssignmentExpression,
  target: IdentifierReference,
): Value {
  const declaration = builder.declarationForReference(target);

  if (expression.operator === "=") {
    const value = lowerExpression(builder, expression.right);
    builder.emit(
      new StoreBindingOp(
        builder.operationId(),
        declaration.id,
        value,
        builder.createValue(declaration.id),
      ),
    );
    return value;
  }

  const operator = binaryOperatorForAssignment(expression.operator);
  const left = lowerIdentifier(builder, target);
  const right = lowerExpression(builder, expression.right);
  const computed = builder.createValue();

  builder.emit(
    new BinaryOp(builder.operationId(), operator, left, right, computed),
  );
  builder.emit(
    new StoreBindingOp(
      builder.operationId(),
      declaration.id,
      computed,
      builder.createValue(declaration.id),
    ),
  );

  return computed;
}

/**
 * Returns the binary operator used by a compound assignment operator.
 */
function binaryOperatorForAssignment(
  operator: AssignmentOperator,
): BinaryOperator {
  switch (operator) {
    case "+=":
      return "+";
    case "-=":
      return "-";
    case "*=":
      return "*";
    case "/=":
      return "/";
    case "%=":
      return "%";
    case "**=":
      return "**";
    case "<<=":
      return "<<";
    case ">>=":
      return ">>";
    case ">>>=":
      return ">>>";
    case "&=":
      return "&";
    case "|=":
      return "|";
    case "^=":
      return "^";
    default:
      throw new Error(`Unsupported assignment operator: ${operator}`);
  }
}

/**
 * Returns whether an assignment operator has short-circuiting semantics.
 */
function isLogicalAssignmentOperator(operator: AssignmentOperator): boolean {
  return operator === "&&=" || operator === "||=" || operator === "??=";
}
