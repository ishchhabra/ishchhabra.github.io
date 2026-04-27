import type * as AST from "../../estree";
import type { AssignmentExpression, MemberExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  ArrayDestructureOp,
  BinaryExpressionOp,
  createOperationId,
  IfTermOp,
  JumpTermOp,
  LiteralOp,
  ObjectDestructureOp,
  Value,
  StoreContextOp,
  StoreLocalOp,
  UnaryExpressionOp,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildLVal } from "../buildLVal";
import { buildNode } from "../buildNode";
import { buildBindingIdentifier, throwTDZAccessError } from "../buildIdentifier";
import { FuncOpBuilder } from "../FuncOpBuilder";
import {
  buildMemberReference,
  createStoreMemberReferenceInstruction,
  emitMemberReferenceStore,
  loadMemberReference,
} from "./buildMemberReference";
import { stabilizePlace } from "../materializePlace";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildAssignmentExpression(
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  /** When true, the result is not used as an expression value (e.g. ExpressionStatement, for-loop update). */
  statementContext: boolean = false,
): Value {
  const left = node.left;
  if (left.type === "Identifier") {
    return buildIdentifierAssignment(
      node,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
      statementContext,
    );
  } else if (left.type === "MemberExpression") {
    return buildMemberExpressionAssignment(
      node,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
      statementContext,
    );
  }

  return buildDestructuringAssignment(
    node,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
    statementContext,
  );
}

function buildIdentifierAssignment(
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  statementContext: boolean,
): Value {
  const operator = node.operator;
  const left = node.left as AST.Value;
  const name = left.name;
  const declarationId = functionBuilder.getDeclarationId(name, scope);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${name}`);
  }

  // Logical assignments (||=, &&=, ??=) have short-circuit semantics:
  // the right side is only evaluated when the condition requires it.
  // Lower to control flow: if (<condition>) x = y;
  if (operator === "||=" || operator === "&&=" || operator === "??=") {
    return buildLogicalIdentifierAssignment(
      node,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  let resultPlace: Value;
  if (operator === "=") {
    const rightPlace = buildAssignmentRight(
      node,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
    resultPlace = statementContext
      ? rightPlace
      : stabilizePlace(rightPlace, functionBuilder, environment);

    if (functionBuilder.isDeclarationInTDZ(declarationId)) {
      throwTDZAccessError(functionBuilder.getDeclarationSourceName(declarationId) ?? name);
    }
  } else {
    if (functionBuilder.isDeclarationInTDZ(declarationId)) {
      throwTDZAccessError(functionBuilder.getDeclarationSourceName(declarationId) ?? name);
    }

    // Use buildBindingIdentifier to reuse the existing declaration place
    // (matching Babel's isReferencedIdentifier() = false for assignment LHS).
    const currentValuePlace = buildBindingIdentifier(left, scope, functionBuilder, environment);

    const rightValuePlace = buildNode(
      node.right,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
    if (rightValuePlace === undefined || Array.isArray(rightValuePlace)) {
      throw new Error("Assignment expression right must be a single place");
    }

    const computedPlace = environment.createValue();
    functionBuilder.addOp(
      environment.createOperation(
        BinaryExpressionOp,
        computedPlace,
        operator.slice(0, -1) as AST.BinaryExpression["operator"],
        currentValuePlace,
        rightValuePlace,
      ),
    );
    resultPlace = statementContext
      ? computedPlace
      : stabilizePlace(computedPlace, functionBuilder, environment);
  }

  const target = buildLVal(
    left as AST.Pattern,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
    { kind: "assignment" },
  );
  if (target.kind !== "binding") {
    throw new Error(`Expected binding assignment target, got: ${target.kind}`);
  }

  const place = environment.createValue();
  const isContext = environment.contextDeclarationIds.has(declarationId);
  const instruction = isContext
    ? environment.createOperation(
        StoreContextOp,
        place,
        target.place,
        resultPlace,
        "let",
        "assignment",
      )
    : environment.createOperation(StoreLocalOp, place, target.place, resultPlace);
  functionBuilder.addOp(instruction);
  return resultPlace;
}

/**
 * Builds the condition place for a logical assignment operator.
 *
 *   ||= : assign when falsy  -> condition is !value
 *   &&= : assign when truthy -> condition is value
 *   ??= : assign when nullish -> condition is value == null
 */
function buildLogicalCondition(
  operator: string,
  valuePlace: Value,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Value {
  if (operator === "||=") {
    const place = environment.createValue();
    functionBuilder.addOp(environment.createOperation(UnaryExpressionOp, place, "!", valuePlace));
    return place;
  }
  if (operator === "&&=") {
    return valuePlace;
  }
  // ??= : value == null (checks both null and undefined)
  const nullPlace = environment.createValue();
  functionBuilder.addOp(environment.createOperation(LiteralOp, nullPlace, null));
  const place = environment.createValue();
  functionBuilder.addOp(
    environment.createOperation(BinaryExpressionOp, place, "==", valuePlace, nullPlace),
  );
  return place;
}

/**
 * Lowers `x ||= y`, `x &&= y`, `x ??= y` to a textbook MLIR `IfOp`
 * with one result place:
 *
 *   %result = IfOp(condition) {
 *     %stored = ... store y into x ...
 *     YieldTermOp(%stored)    // the new value of x
 *   } else {
 *     YieldTermOp(%oldValue)  // the original value of x
 *   }
 */
function buildLogicalIdentifierAssignment(
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const operator = node.operator;
  const left = node.left as AST.Value;

  const declarationId = functionBuilder.getDeclarationId(left.name, scope);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${left.name}`);
  }

  if (functionBuilder.isDeclarationInTDZ(declarationId)) {
    throwTDZAccessError(functionBuilder.getDeclarationSourceName(declarationId) ?? left.name);
  }

  const oldValuePlace = buildBindingIdentifier(left, scope, functionBuilder, environment);
  const conditionPlace = buildLogicalCondition(
    operator,
    oldValuePlace,
    functionBuilder,
    environment,
  );
  const parentBlock = functionBuilder.currentBlock;

  const consBlock = environment.createBlock();
  const altBlock = environment.createBlock();
  const joinBlock = environment.createBlock();
  const resultPlace = environment.createValue();
  joinBlock.params = [resultPlace];
  functionBuilder.addBlock(consBlock);
  functionBuilder.addBlock(altBlock);
  functionBuilder.addBlock(joinBlock);

  parentBlock.setTerminal(
    new IfTermOp(
      createOperationId(environment),
      conditionPlace,
      { block: consBlock, args: [] },
      { block: altBlock, args: [] },
      joinBlock,
    ),
  );

  functionBuilder.currentBlock = consBlock;
  const rightPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Logical assignment right must be a single place");
  }
  const stabilizedRightPlace = stabilizePlace(rightPlace, functionBuilder, environment);
  const target = buildLVal(
    left as AST.Pattern,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
    {
      kind: "assignment",
    },
  );
  if (target.kind !== "binding") {
    throw new Error(`Expected binding assignment target, got: ${target.kind}`);
  }
  const isContext = environment.contextDeclarationIds.has(declarationId);
  functionBuilder.addOp(
    isContext
      ? environment.createOperation(
          StoreContextOp,
          environment.createValue(),
          target.place,
          stabilizedRightPlace,
          "let",
          "assignment",
        )
      : environment.createOperation(
          StoreLocalOp,
          environment.createValue(),
          target.place,
          stabilizedRightPlace,
        ),
  );
  functionBuilder.currentBlock.setTerminal(
    new JumpTermOp(createOperationId(environment), joinBlock, [stabilizedRightPlace]),
  );

  altBlock.setTerminal(new JumpTermOp(createOperationId(environment), joinBlock, [oldValuePlace]));

  functionBuilder.currentBlock = joinBlock;
  return resultPlace;
}

function buildMemberExpressionAssignment(
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  statementContext: boolean,
): Value {
  const operator = node.operator;

  if (operator === "||=" || operator === "&&=" || operator === "??=") {
    return buildLogicalMemberAssignment(node, scope, functionBuilder, moduleBuilder, environment);
  }

  const left = node.left as MemberExpression;
  const reference = buildMemberReference(left, scope, functionBuilder, moduleBuilder, environment, {
    reusable: operator !== "=",
  });

  let rightPlace: Value;
  if (operator === "=") {
    rightPlace = buildAssignmentRight(node, scope, functionBuilder, moduleBuilder, environment);
  } else {
    const currentValuePlace = loadMemberReference(reference, functionBuilder, environment);

    const rhsPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
    if (rhsPlace === undefined || Array.isArray(rhsPlace)) {
      throw new Error("Assignment expression right must be a single place");
    }

    rightPlace = environment.createValue();
    functionBuilder.addOp(
      environment.createOperation(
        BinaryExpressionOp,
        rightPlace,
        operator.slice(0, -1) as AST.BinaryExpression["operator"],
        currentValuePlace,
        rhsPlace,
      ),
    );
  }
  const resultPlace = statementContext
    ? rightPlace
    : stabilizePlace(rightPlace, functionBuilder, environment);

  emitMemberReferenceStore(reference, resultPlace, functionBuilder, environment);

  return resultPlace;
}

/**
 * Lowers `obj.x ||= y`, `obj.x &&= y`, and `obj.x ??= y` to a
 * textbook MLIR `IfOp` with one result place:
 *
 *   %cached = <load obj.x>
 *   %result = IfOp(cond(%cached)) {
 *     obj.x = y
 *     YieldTermOp(y)
 *   } else {
 *     YieldTermOp(%cached)
 *   }
 *
 * The property read is cached once before the IfOp so the getter
 * fires at most once.
 */
function buildLogicalMemberAssignment(
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const operator = node.operator;
  const left = node.left as MemberExpression;
  const reference = buildMemberReference(left, scope, functionBuilder, moduleBuilder, environment, {
    reusable: true,
  });

  const cachedPlace = loadMemberReference(reference, functionBuilder, environment);
  const conditionPlace = buildLogicalCondition(operator, cachedPlace, functionBuilder, environment);
  const parentBlock = functionBuilder.currentBlock;

  const consBlock = environment.createBlock();
  const altBlock = environment.createBlock();
  const joinBlock = environment.createBlock();
  const resultPlace = environment.createValue();
  joinBlock.params = [resultPlace];
  functionBuilder.addBlock(consBlock);
  functionBuilder.addBlock(altBlock);
  functionBuilder.addBlock(joinBlock);

  parentBlock.setTerminal(
    new IfTermOp(
      createOperationId(environment),
      conditionPlace,
      { block: consBlock, args: [] },
      { block: altBlock, args: [] },
      joinBlock,
    ),
  );

  functionBuilder.currentBlock = consBlock;
  const rightPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Logical member assignment right must be a single place");
  }
  const stabilizedRightPlace = stabilizePlace(rightPlace, functionBuilder, environment);
  functionBuilder.addOp(
    createStoreMemberReferenceInstruction(
      reference,
      environment.createValue(),
      stabilizedRightPlace,
      environment,
    ),
  );
  functionBuilder.currentBlock.setTerminal(
    new JumpTermOp(createOperationId(environment), joinBlock, [stabilizedRightPlace]),
  );

  altBlock.setTerminal(new JumpTermOp(createOperationId(environment), joinBlock, [cachedPlace]));

  functionBuilder.currentBlock = joinBlock;
  return resultPlace;
}

function buildDestructuringAssignment(
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  statementContext: boolean,
): Value {
  const rightPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Assignment expression right must be a single place");
  }
  const resultPlace = statementContext
    ? rightPlace
    : stabilizePlace(rightPlace, functionBuilder, environment);

  const left = node.left;
  const tdzTargetName = findTDZAssignmentTarget(left, scope, functionBuilder);
  if (tdzTargetName !== undefined) {
    throwTDZAccessError(tdzTargetName);
  }

  const target = buildLVal(
    left as AST.Pattern,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
    { kind: "assignment" },
  );

  const place = environment.createValue();
  let instruction;
  if (target.kind === "array") {
    instruction = environment.createOperation(
      ArrayDestructureOp,
      place,
      target.elements,
      resultPlace,
      "assignment",
      null,
    );
  } else if (target.kind === "object") {
    instruction = environment.createOperation(
      ObjectDestructureOp,
      place,
      target.properties,
      resultPlace,
      "assignment",
      null,
    );
  } else {
    throw new Error(`Unsupported destructure target: ${target.kind}`);
  }
  functionBuilder.addOp(instruction);
  return resultPlace;
}

function buildAssignmentRight(
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const rightPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Assignment expression right must be a single place");
  }

  const operator = node.operator;
  if (operator === "=") {
    return rightPlace;
  }

  const binaryOperator = operator.slice(0, -1);

  const leftPlace = buildNode(node.left, scope, functionBuilder, moduleBuilder, environment);
  if (leftPlace === undefined || Array.isArray(leftPlace)) {
    throw new Error("Assignment expression left must be a single place");
  }

  const place = environment.createValue();
  functionBuilder.addOp(
    environment.createOperation(
      BinaryExpressionOp,
      place,
      binaryOperator as AST.BinaryExpression["operator"],
      leftPlace,
      rightPlace,
    ),
  );

  return place;
}

function findTDZAssignmentTarget(
  left: AST.Pattern | MemberExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
): string | undefined {
  if (left.type === "Identifier") {
    const declarationId = functionBuilder.getDeclarationId(left.name, scope);
    if (declarationId !== undefined && functionBuilder.isDeclarationInTDZ(declarationId)) {
      return functionBuilder.getDeclarationSourceName(declarationId) ?? left.name;
    }
    return undefined;
  }

  if (left.type === "ArrayPattern") {
    for (const element of left.elements) {
      if (element == null) continue;
      const found = findTDZAssignmentTarget(element, scope, functionBuilder);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  if (left.type === "ObjectPattern") {
    for (const property of left.properties) {
      if (property.type === "RestElement") {
        const found = findTDZAssignmentTarget(property.argument, scope, functionBuilder);
        if (found !== undefined) return found;
      } else if (property.type === "Property") {
        const value = property.value;
        if (
          value.type === "Identifier" ||
          value.type === "ArrayPattern" ||
          value.type === "ObjectPattern" ||
          value.type === "AssignmentPattern" ||
          value.type === "MemberExpression"
        ) {
          const found = findTDZAssignmentTarget(value, scope, functionBuilder);
          if (found !== undefined) return found;
        }
      }
    }
    return undefined;
  }

  if (left.type === "AssignmentPattern") {
    return findTDZAssignmentTarget(left.left, scope, functionBuilder);
  }

  if (left.type === "RestElement") {
    return findTDZAssignmentTarget(left.argument, scope, functionBuilder);
  }

  return undefined;
}
