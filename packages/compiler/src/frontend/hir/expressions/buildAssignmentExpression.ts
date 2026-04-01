import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import {
  ArrayPatternInstruction,
  BaseInstruction,
  BinaryExpressionInstruction,
  BindingIdentifierInstruction,
  BranchTerminal,
  createInstructionId,
  ExpressionStatementInstruction,
  JumpTerminal,
  LiteralInstruction,
  LoadLocalInstruction,
  ObjectPropertyInstruction,
  Place,
  RestElementInstruction,
  StoreContextInstruction,
  StoreLocalInstruction,
  UnaryExpressionInstruction,
} from "../../../ir";
import { AssignmentPatternInstruction } from "../../../ir/instructions/pattern/AssignmentPattern";
import { ObjectPatternInstruction } from "../../../ir/instructions/pattern/ObjectPattern";
import { buildNode } from "../buildNode";
import { throwTDZAccessError } from "../buildIdentifier";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import {
  buildMemberReference,
  createStoreMemberReferenceInstruction,
  emitMemberReferenceStore,
  loadMemberReference,
} from "./buildMemberReference";
import { stabilizePlace } from "../materializePlace";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildAssignmentExpression(
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const leftPath = nodePath.get("left");
  if (leftPath.isIdentifier()) {
    return buildIdentifierAssignment(nodePath, functionBuilder, moduleBuilder, environment);
  } else if (leftPath.isMemberExpression()) {
    return buildMemberExpressionAssignment(nodePath, functionBuilder, moduleBuilder, environment);
  }

  return buildDestructuringAssignment(nodePath, functionBuilder, moduleBuilder, environment);
}

function buildIdentifierAssignment(
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const operator = nodePath.node.operator;
  const leftPath: NodePath<t.Identifier> = nodePath.get("left") as NodePath<t.Identifier>;
  leftPath.assertIdentifier();
  const name = leftPath.node.name;
  const declarationId = functionBuilder.getDeclarationId(name, leftPath);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${name}`);
  }

  // Logical assignments (||=, &&=, ??=) have short-circuit semantics:
  // the right side is only evaluated when the condition requires it.
  // Lower to control flow: if (<condition>) x = y;
  if (operator === "||=" || operator === "&&=" || operator === "??=") {
    return buildLogicalIdentifierAssignment(nodePath, functionBuilder, moduleBuilder, environment);
  }

  let resultPlace: Place;
  if (operator === "=") {
    const rightPlace = buildAssignmentRight(nodePath, functionBuilder, moduleBuilder, environment);
    resultPlace = stabilizeAssignmentResult(rightPlace, nodePath, functionBuilder, environment);

    if (functionBuilder.isDeclarationInTDZ(declarationId)) {
      throwTDZAccessError(functionBuilder.getDeclarationSourceName(declarationId) ?? name);
    }
  } else {
    if (functionBuilder.isDeclarationInTDZ(declarationId)) {
      throwTDZAccessError(functionBuilder.getDeclarationSourceName(declarationId) ?? name);
    }

    const currentValuePlace = buildNode(leftPath, functionBuilder, moduleBuilder, environment);
    if (currentValuePlace === undefined || Array.isArray(currentValuePlace)) {
      throw new Error("Assignment expression left must be a single place");
    }

    const rightPath = nodePath.get("right");
    const rightValuePlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
    if (rightValuePlace === undefined || Array.isArray(rightValuePlace)) {
      throw new Error("Assignment expression right must be a single place");
    }

    const computedPlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(
        BinaryExpressionInstruction,
        computedPlace,
        nodePath,
        operator.slice(0, -1) as t.BinaryExpression["operator"],
        currentValuePlace,
        rightValuePlace,
      ),
    );
    resultPlace = stabilizeAssignmentResult(computedPlace, nodePath, functionBuilder, environment);
  }

  const { place: leftPlace } = buildIdentifierAssignmentLeft(
    leftPath,
    nodePath,
    functionBuilder,
    environment,
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const isContext = environment.contextDeclarationIds.has(declarationId);
  const instruction = isContext
    ? environment.createInstruction(
        StoreContextInstruction,
        place,
        nodePath,
        leftPlace,
        resultPlace,
        "let",
        "assignment",
      )
    : environment.createInstruction(
        StoreLocalInstruction,
        place,
        nodePath,
        leftPlace,
        resultPlace,
        "const",
      );
  functionBuilder.addInstruction(instruction);
  return resultPlace;
}

/**
 * Builds the condition place for a logical assignment operator.
 *
 *   ||= : assign when falsy  → condition is !value
 *   &&= : assign when truthy → condition is value
 *   ??= : assign when nullish → condition is value == null
 */
function buildLogicalCondition(
  operator: string,
  valuePlace: Place,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  if (operator === "||=") {
    const place = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(UnaryExpressionInstruction, place, undefined, "!", valuePlace),
    );
    return place;
  }
  if (operator === "&&=") {
    return valuePlace;
  }
  // ??= : value == null (checks both null and undefined)
  const nullPlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(LiteralInstruction, nullPlace, undefined, null),
  );
  const place = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(
      BinaryExpressionInstruction,
      place,
      undefined,
      "==",
      valuePlace,
      nullPlace,
    ),
  );
  return place;
}

/**
 * Emits `let _result = initialValue` and returns the binding and store
 * places, used by logical assignment lowering to track the expression
 * result across both branches.
 */
function emitResultVariable(
  initialValue: Place,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): { bindingPlace: Place; storePlace: Place } {
  const bindingPlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(BindingIdentifierInstruction, bindingPlace, undefined),
  );
  environment.registerDeclaration(
    bindingPlace.identifier.declarationId,
    functionBuilder.currentBlock.id,
    bindingPlace.id,
  );
  const storePlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(
      StoreLocalInstruction,
      storePlace,
      undefined,
      bindingPlace,
      initialValue,
      "let",
    ),
  );
  return { bindingPlace, storePlace };
}

/**
 * Emits `_result = newValue` in the current block, creating a new SSA
 * version of the result variable so the phi merge works correctly.
 */
function emitResultUpdate(
  bindingPlace: Place,
  newValue: Place,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): void {
  const updateBinding = environment.createPlace(
    environment.createIdentifier(bindingPlace.identifier.declarationId),
  );
  functionBuilder.addInstruction(
    environment.createInstruction(BindingIdentifierInstruction, updateBinding, undefined),
  );
  environment.registerDeclaration(
    bindingPlace.identifier.declarationId,
    functionBuilder.currentBlock.id,
    updateBinding.id,
  );
  functionBuilder.addInstruction(
    environment.createInstruction(
      StoreLocalInstruction,
      environment.createPlace(environment.createIdentifier()),
      undefined,
      updateBinding,
      newValue,
      "const",
    ),
  );
}

function isStatementOnlyAssignmentContext(nodePath: NodePath<t.AssignmentExpression>): boolean {
  const parentPath = nodePath.parentPath;
  if (!parentPath) return false;
  if (parentPath.isExpressionStatement()) return true;
  if (parentPath.isForStatement()) {
    const initPath = parentPath.get("init");
    if (!Array.isArray(initPath) && initPath.hasNode() && initPath.node === nodePath.node) {
      return true;
    }
    const updatePath = parentPath.get("update");
    if (!Array.isArray(updatePath) && updatePath.hasNode() && updatePath.node === nodePath.node) {
      return true;
    }
  }
  return false;
}

function stabilizeAssignmentResult(
  valuePlace: Place,
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  if (isStatementOnlyAssignmentContext(nodePath)) {
    return valuePlace;
  }

  return stabilizePlace(valuePlace, nodePath, functionBuilder, environment);
}

/**
 * Lowers `x ||= y`, `x &&= y`, `x ??= y` to:
 *
 *   let _result = x;
 *   if (<condition>) { x = y; _result = y; }
 *   // expression value is _result
 */
function buildLogicalIdentifierAssignment(
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const operator = nodePath.node.operator;
  const leftPath = nodePath.get("left") as NodePath<t.Identifier>;

  const declarationId = functionBuilder.getDeclarationId(leftPath.node.name, leftPath);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${leftPath.node.name}`);
  }

  if (functionBuilder.isDeclarationInTDZ(declarationId)) {
    throwTDZAccessError(
      functionBuilder.getDeclarationSourceName(declarationId) ?? leftPath.node.name,
    );
  }

  // Load x once.
  const testPlace = buildNode(leftPath, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("Logical assignment left must be a single place");
  }

  const conditionPlace = buildLogicalCondition(operator, testPlace, functionBuilder, environment);

  // let _result = x; — holds the expression value across both paths.
  const { bindingPlace } = emitResultVariable(testPlace, functionBuilder, environment);

  const assignBlock = environment.createBlock();
  functionBuilder.blocks.set(assignBlock.id, assignBlock);
  const mergeBlock = environment.createBlock();
  functionBuilder.blocks.set(mergeBlock.id, mergeBlock);

  functionBuilder.currentBlock.terminal = new BranchTerminal(
    createInstructionId(environment),
    conditionPlace,
    assignBlock.id,
    mergeBlock.id,
    mergeBlock.id,
  );

  // Build the assignment in assignBlock.
  functionBuilder.currentBlock = assignBlock;

  const rightPath = nodePath.get("right");
  const rightPlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Logical assignment right must be a single place");
  }
  const stabilizedRightPlace = stabilizePlace(rightPlace, nodePath, functionBuilder, environment);

  // Store x = y.
  const { place: lvalPlace } = buildIdentifierAssignmentLeft(
    leftPath,
    nodePath,
    functionBuilder,
    environment,
  );
  const isContext = environment.contextDeclarationIds.has(declarationId);
  functionBuilder.addInstruction(
    isContext
      ? environment.createInstruction(
          StoreContextInstruction,
          environment.createPlace(environment.createIdentifier()),
          nodePath,
          lvalPlace,
          stabilizedRightPlace,
          "let",
          "assignment",
        )
      : environment.createInstruction(
          StoreLocalInstruction,
          environment.createPlace(environment.createIdentifier()),
          nodePath,
          lvalPlace,
          stabilizedRightPlace,
          "const",
        ),
  );

  // _result = y;
  emitResultUpdate(bindingPlace, stabilizedRightPlace, functionBuilder, environment);

  functionBuilder.currentBlock.terminal = new JumpTerminal(
    createInstructionId(environment),
    mergeBlock.id,
  );

  // Load _result at the merge block. SSA creates a phi merging the
  // initial value (skip path) and the updated value (assign path).
  functionBuilder.currentBlock = mergeBlock;
  const resultPlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(LoadLocalInstruction, resultPlace, undefined, bindingPlace),
  );
  return resultPlace;
}

function buildMemberExpressionAssignment(
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const operator = nodePath.node.operator;

  if (operator === "||=" || operator === "&&=" || operator === "??=") {
    return buildLogicalMemberAssignment(nodePath, functionBuilder, moduleBuilder, environment);
  }

  const leftPath: NodePath<t.AssignmentExpression["left"]> = nodePath.get("left");
  leftPath.assertMemberExpression();
  const reference = buildMemberReference(leftPath, functionBuilder, moduleBuilder, environment, {
    reusable: operator !== "=",
  });

  let rightPlace: Place;
  if (operator === "=") {
    rightPlace = buildAssignmentRight(nodePath, functionBuilder, moduleBuilder, environment);
  } else {
    const currentValuePlace = loadMemberReference(
      reference,
      nodePath,
      functionBuilder,
      environment,
    );

    const rightPath = nodePath.get("right");
    const rhsPlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
    if (rhsPlace === undefined || Array.isArray(rhsPlace)) {
      throw new Error("Assignment expression right must be a single place");
    }

    rightPlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(
        BinaryExpressionInstruction,
        rightPlace,
        nodePath,
        operator.slice(0, -1) as t.BinaryExpression["operator"],
        currentValuePlace,
        rhsPlace,
      ),
    );
  }
  const resultPlace = stabilizeAssignmentResult(rightPlace, nodePath, functionBuilder, environment);

  emitMemberReferenceStore(reference, nodePath, resultPlace, functionBuilder, environment);

  return resultPlace;
}

/**
 * Lowers `obj.x ||= y`, `obj.x &&= y`, and `obj.x ??= y` to:
 *
 *   let _result = obj.x;          // read property once
 *   if (<condition>) {
 *     _result = y;                // update result
 *     obj.x = y;                  // store property
 *   }
 *   // expression value is _result
 *
 * The temp variable holds the result across both paths without
 * re-reading the property (which would trigger a getter twice).
 */
function buildLogicalMemberAssignment(
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const operator = nodePath.node.operator;
  const leftPath = nodePath.get("left") as NodePath<t.MemberExpression>;
  const reference = buildMemberReference(leftPath, functionBuilder, moduleBuilder, environment, {
    reusable: true,
  });

  // Load the property value once.
  const testPlace = loadMemberReference(reference, nodePath, functionBuilder, environment);

  // let _result = testPlace; — cache the property read. The condition
  // and all subsequent references use _result, not testPlace, to avoid
  // re-triggering getters.
  const { bindingPlace: resultBinding } = emitResultVariable(
    testPlace,
    functionBuilder,
    environment,
  );

  // Build the condition from the cached result, not from testPlace.
  const cachedPlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(LoadLocalInstruction, cachedPlace, undefined, resultBinding),
  );
  const conditionPlace = buildLogicalCondition(operator, cachedPlace, functionBuilder, environment);

  const assignBlock = environment.createBlock();
  functionBuilder.blocks.set(assignBlock.id, assignBlock);
  const mergeBlock = environment.createBlock();
  functionBuilder.blocks.set(mergeBlock.id, mergeBlock);

  functionBuilder.currentBlock.terminal = new BranchTerminal(
    createInstructionId(environment),
    conditionPlace,
    assignBlock.id,
    mergeBlock.id,
    mergeBlock.id,
  );

  // Build the assignment in assignBlock.
  functionBuilder.currentBlock = assignBlock;

  const rightPath = nodePath.get("right");
  const rightPlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Logical member assignment right must be a single place");
  }
  const stabilizedRightPlace = stabilizePlace(rightPlace, nodePath, functionBuilder, environment);

  // Store the property.
  const storePlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    createStoreMemberReferenceInstruction(
      reference,
      storePlace,
      nodePath,
      stabilizedRightPlace,
      environment,
    ),
  );

  // Wrap the store in an ExpressionStatement so it emits as a statement.
  functionBuilder.addInstruction(
    environment.createInstruction(
      ExpressionStatementInstruction,
      environment.createPlace(environment.createIdentifier()),
      nodePath,
      storePlace,
    ),
  );

  // _result = y;
  emitResultUpdate(resultBinding, stabilizedRightPlace, functionBuilder, environment);

  functionBuilder.currentBlock.terminal = new JumpTerminal(
    createInstructionId(environment),
    mergeBlock.id,
  );

  // Load _result at the merge block. SSA creates a phi merging the
  // initial value (skip path) and the updated value (assign path).
  functionBuilder.currentBlock = mergeBlock;
  const resultPlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(LoadLocalInstruction, resultPlace, undefined, resultBinding),
  );
  return resultPlace;
}

function buildDestructuringAssignment(
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const rightPath = nodePath.get("right");
  const rightPlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Assignment expression right must be a single place");
  }
  const resultPlace = stabilizeAssignmentResult(rightPlace, nodePath, functionBuilder, environment);

  const leftPath: NodePath<t.AssignmentExpression["left"]> = nodePath.get("left");
  leftPath.assertLVal();
  const tdzTargetName = findTDZAssignmentTarget(leftPath, nodePath, functionBuilder);
  if (tdzTargetName !== undefined) {
    throwTDZAccessError(tdzTargetName);
  }
  const {
    place: leftPlace,
    instructions,
    identifiers,
    hasContext,
  } = buildAssignmentLeft(leftPath, nodePath, functionBuilder, moduleBuilder, environment);

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = hasContext
    ? environment.createInstruction(
        StoreContextInstruction,
        place,
        nodePath,
        leftPlace,
        resultPlace,
        "let",
        "assignment",
        identifiers,
      )
    : environment.createInstruction(
        StoreLocalInstruction,
        place,
        nodePath,
        leftPlace,
        resultPlace,
        "const",
        identifiers,
      );
  functionBuilder.addInstruction(instruction);

  for (const instruction of instructions) {
    functionBuilder.addInstruction(instruction);
  }
  return resultPlace;
}

export function buildAssignmentLeft(
  leftPath: NodePath<t.LVal>,
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; instructions: BaseInstruction[]; identifiers: Place[]; hasContext: boolean } {
  if (leftPath.isIdentifier()) {
    return buildIdentifierAssignmentLeft(leftPath, nodePath, functionBuilder, environment);
  } else if (leftPath.isMemberExpression()) {
    return buildMemberExpressionAssignmentLeft(
      leftPath,
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  } else if (leftPath.isArrayPattern()) {
    return buildArrayPatternAssignmentLeft(
      leftPath,
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  } else if (leftPath.isObjectPattern()) {
    return buildObjectPatternAssignmentLeft(
      leftPath,
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  } else if (leftPath.isAssignmentPattern()) {
    return buildAssignmentPatternAssignmentLeft(
      leftPath,
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  } else if (leftPath.isRestElement()) {
    return buildRestElementAssignmentLeft(
      leftPath,
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  throw new Error("Unsupported assignment left");
}

function buildIdentifierAssignmentLeft(
  leftPath: NodePath<t.Identifier>,
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): { place: Place; instructions: BaseInstruction[]; identifiers: Place[]; hasContext: boolean } {
  const declarationId = functionBuilder.getDeclarationId(leftPath.node.name, nodePath);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${leftPath.node.name}`);
  }

  // For context variables, reuse the original place rather than creating a
  // new SSA version — context variables are not renamed by SSA.
  if (environment.contextDeclarationIds.has(declarationId)) {
    const latestDeclaration = environment.getLatestDeclaration(declarationId);
    const existingPlace = environment.places.get(latestDeclaration.placeId)!;
    return {
      place: existingPlace,
      instructions: [],
      identifiers: [existingPlace],
      hasContext: true,
    };
  }

  const identifier = environment.createIdentifier(declarationId);
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(BindingIdentifierInstruction, place, nodePath);
  functionBuilder.addInstruction(instruction);
  environment.registerDeclaration(declarationId, functionBuilder.currentBlock.id, place.id);
  return { place, instructions: [], identifiers: [place], hasContext: false };
}

function buildMemberExpressionAssignmentLeft(
  leftPath: NodePath<t.MemberExpression>,
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; instructions: BaseInstruction[]; identifiers: Place[]; hasContext: boolean } {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(BindingIdentifierInstruction, place, nodePath);
  functionBuilder.addInstruction(instruction);
  environment.registerDeclaration(
    identifier.declarationId,
    functionBuilder.currentBlock.id,
    place.id,
  );
  const reference = buildMemberReference(leftPath, functionBuilder, moduleBuilder, environment);
  const storePropertyPlace = environment.createPlace(environment.createIdentifier());
  const storePropertyInstruction = createStoreMemberReferenceInstruction(
    reference,
    storePropertyPlace,
    nodePath,
    place,
    environment,
  );

  const expressionStatementPlace = environment.createPlace(environment.createIdentifier());
  const expressionStatementInstruction = environment.createInstruction(
    ExpressionStatementInstruction,
    expressionStatementPlace,
    nodePath,
    storePropertyPlace,
  );

  return {
    place,
    instructions: [storePropertyInstruction, expressionStatementInstruction],
    identifiers: [place],
    hasContext: false,
  };
}

function buildArrayPatternAssignmentLeft(
  leftPath: NodePath<t.ArrayPattern>,
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; instructions: BaseInstruction[]; identifiers: Place[]; hasContext: boolean } {
  const instructions: BaseInstruction[] = [];
  const identifiers: Place[] = [];
  let hasContext = false;

  const elementPaths = leftPath.get("elements");
  const elementPlaces = elementPaths.map((elementPath) => {
    if (elementPath.isOptionalMemberExpression()) {
      throw new Error("Unsupported optional member expression");
    }

    if (!elementPath.hasNode()) {
      return null;
    }

    const result = buildAssignmentLeft(
      elementPath as NodePath<t.LVal>,
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
    instructions.push(...result.instructions);
    identifiers.push(...result.identifiers);
    if (result.hasContext) hasContext = true;
    return result.place;
  });

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ArrayPatternInstruction,
    place,
    leftPath,
    elementPlaces,
    identifiers,
  );
  functionBuilder.addInstruction(instruction);
  return { place, instructions, identifiers, hasContext };
}

function buildObjectPatternAssignmentLeft(
  leftPath: NodePath<t.ObjectPattern>,
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; instructions: BaseInstruction[]; identifiers: Place[]; hasContext: boolean } {
  const instructions: BaseInstruction[] = [];
  const identifiers: Place[] = [];
  let hasContext = false;

  const propertyPaths = leftPath.get("properties");
  const propertyPlaces = propertyPaths.map((propertyPath) => {
    if (propertyPath.isObjectProperty()) {
      const keyPath = propertyPath.get("key");
      let keyPlace;
      if (!propertyPath.node.computed && keyPath.isIdentifier()) {
        // Non-computed identifier keys are property labels (string literals),
        // not variable references.  Emit a LiteralInstruction so the key
        // survives SSA transformations (clone/rewrite) unchanged.
        const keyIdentifier = environment.createIdentifier();
        keyPlace = environment.createPlace(keyIdentifier);
        const keyInstruction = environment.createInstruction(
          LiteralInstruction,
          keyPlace,
          keyPath,
          keyPath.node.name,
        );
        functionBuilder.addInstruction(keyInstruction);
      } else {
        keyPlace = buildNode(keyPath, functionBuilder, moduleBuilder, environment);
        if (keyPlace === undefined || Array.isArray(keyPlace)) {
          throw new Error("Object pattern key must be a single place");
        }
      }

      const valuePath = propertyPath.get("value");
      const result = buildAssignmentLeft(
        valuePath as NodePath<t.LVal>,
        nodePath,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      instructions.push(...result.instructions);
      identifiers.push(...result.identifiers);
      if (result.hasContext) hasContext = true;

      const identifier = environment.createIdentifier();
      const place = environment.createPlace(identifier);
      const instruction = environment.createInstruction(
        ObjectPropertyInstruction,
        place,
        nodePath,
        keyPlace,
        result.place,
        propertyPath.node.computed,
        propertyPath.node.shorthand,
        result.identifiers,
      );
      functionBuilder.addInstruction(instruction);
      return place;
    }

    if (propertyPath.isRestElement()) {
      const argumentPath = propertyPath.get("argument");
      const result = buildAssignmentLeft(
        argumentPath,
        nodePath,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      instructions.push(...result.instructions);
      identifiers.push(...result.identifiers);
      if (result.hasContext) hasContext = true;

      const identifier = environment.createIdentifier();
      const place = environment.createPlace(identifier);
      const instruction = environment.createInstruction(
        RestElementInstruction,
        place,
        propertyPath,
        result.place,
        result.identifiers,
      );
      functionBuilder.addInstruction(instruction);
      return place;
    }

    throw new Error("Unsupported object pattern property");
  });

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ObjectPatternInstruction,
    place,
    leftPath,
    propertyPlaces,
    identifiers,
  );
  functionBuilder.addInstruction(instruction);
  return { place, instructions, identifiers, hasContext };
}

function buildAssignmentPatternAssignmentLeft(
  leftPath: NodePath<t.AssignmentPattern>,
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; instructions: BaseInstruction[]; identifiers: Place[]; hasContext: boolean } {
  const leftPath_ = leftPath.get("left");
  const {
    place: leftPlace,
    instructions,
    identifiers,
    hasContext,
  } = buildAssignmentLeft(leftPath_, nodePath, functionBuilder, moduleBuilder, environment);

  const rightPath = leftPath.get("right");
  const rightPlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Assignment pattern right must be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    AssignmentPatternInstruction,
    place,
    leftPath,
    leftPlace,
    rightPlace,
    identifiers,
  );
  functionBuilder.addInstruction(instruction);
  return { place, instructions, identifiers, hasContext };
}

function buildRestElementAssignmentLeft(
  leftPath: NodePath<t.RestElement>,
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; instructions: BaseInstruction[]; identifiers: Place[]; hasContext: boolean } {
  const argumentPath = leftPath.get("argument");
  const {
    place: argumentPlace,
    instructions: argumentInstructions,
    identifiers,
    hasContext,
  } = buildAssignmentLeft(argumentPath, nodePath, functionBuilder, moduleBuilder, environment);

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    RestElementInstruction,
    place,
    leftPath,
    argumentPlace,
    identifiers,
  );
  functionBuilder.addInstruction(instruction);
  return { place, instructions: [...argumentInstructions], identifiers, hasContext };
}

function buildAssignmentRight(
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const rightPath = nodePath.get("right");
  const rightPlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Assignment expression right must be a single place");
  }

  const operator = nodePath.node.operator;
  if (operator === "=") {
    return rightPlace;
  }

  const binaryOperator = operator.slice(0, -1);

  const leftPath: NodePath<t.AssignmentExpression["left"]> = nodePath.get("left");

  const leftPlace = buildNode(leftPath, functionBuilder, moduleBuilder, environment);
  if (leftPlace === undefined || Array.isArray(leftPlace)) {
    throw new Error("Assignment expression left must be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  functionBuilder.addInstruction(
    environment.createInstruction(
      BinaryExpressionInstruction,
      place,
      nodePath,
      binaryOperator as t.BinaryExpression["operator"],
      leftPlace,
      rightPlace,
    ),
  );

  return place;
}

function findTDZAssignmentTarget(
  leftPath: NodePath<t.LVal>,
  nodePath: NodePath<t.AssignmentExpression>,
  functionBuilder: FunctionIRBuilder,
): string | undefined {
  if (leftPath.isIdentifier()) {
    const declarationId = functionBuilder.getDeclarationId(leftPath.node.name, nodePath);
    if (declarationId !== undefined && functionBuilder.isDeclarationInTDZ(declarationId)) {
      return functionBuilder.getDeclarationSourceName(declarationId) ?? leftPath.node.name;
    }
    return undefined;
  }

  if (leftPath.isArrayPattern()) {
    const elementPaths = leftPath.get("elements") as Array<
      NodePath<t.ArrayPattern["elements"][number]>
    >;
    for (const elementPath of elementPaths) {
      if (!elementPath.hasNode()) continue;
      if (!elementPath.isLVal()) {
        throw new Error(`Unsupported array assignment target: ${elementPath.type}`);
      }
      const found = findTDZAssignmentTarget(elementPath, nodePath, functionBuilder);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  if (leftPath.isObjectPattern()) {
    for (const propertyPath of leftPath.get("properties")) {
      if (propertyPath.isRestElement()) {
        const argumentPath = propertyPath.get("argument");
        const found = findTDZAssignmentTarget(argumentPath, nodePath, functionBuilder);
        if (found !== undefined) return found;
      } else if (propertyPath.isObjectProperty()) {
        const valuePath = propertyPath.get("value");
        if (valuePath.isLVal()) {
          const found = findTDZAssignmentTarget(valuePath, nodePath, functionBuilder);
          if (found !== undefined) return found;
        }
      }
    }
    return undefined;
  }

  if (leftPath.isAssignmentPattern()) {
    return findTDZAssignmentTarget(leftPath.get("left"), nodePath, functionBuilder);
  }

  if (leftPath.isRestElement()) {
    return findTDZAssignmentTarget(leftPath.get("argument"), nodePath, functionBuilder);
  }

  return undefined;
}
