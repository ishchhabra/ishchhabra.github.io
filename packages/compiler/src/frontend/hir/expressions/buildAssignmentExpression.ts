import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { isStaticMemberAccess } from "../../../babel-utils";
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
  LoadDynamicPropertyInstruction,
  LoadLocalInstruction,
  LoadStaticPropertyInstruction,
  ObjectPropertyInstruction,
  Place,
  RestElementInstruction,
  StoreContextInstruction,
  StoreLocalInstruction,
  UnaryExpressionInstruction,
} from "../../../ir";
import { StoreDynamicPropertyInstruction } from "../../../ir/instructions/memory/StoreDynamicProperty";
import { StoreStaticPropertyInstruction } from "../../../ir/instructions/memory/StoreStaticProperty";
import { AssignmentPatternInstruction } from "../../../ir/instructions/pattern/AssignmentPattern";
import { ObjectPatternInstruction } from "../../../ir/instructions/pattern/ObjectPattern";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
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

  // Logical assignments (||=, &&=, ??=) have short-circuit semantics:
  // the right side is only evaluated when the condition requires it.
  // Lower to control flow: if (<condition>) x = y;
  if (operator === "||=" || operator === "&&=" || operator === "??=") {
    return buildLogicalIdentifierAssignment(nodePath, functionBuilder, moduleBuilder, environment);
  }

  const rightPlace = buildAssignmentRight(nodePath, functionBuilder, moduleBuilder, environment);

  const leftPath: NodePath<t.AssignmentExpression["left"]> = nodePath.get("left");
  leftPath.assertIdentifier();

  const declarationId = functionBuilder.getDeclarationId(leftPath.node.name, leftPath);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${leftPath.node.name}`);
  }

  const { place: leftPlace } = buildIdentifierAssignmentLeft(
    leftPath,
    nodePath,
    functionBuilder,
    environment,
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const StoreClass = environment.contextDeclarationIds.has(declarationId)
    ? StoreContextInstruction
    : StoreLocalInstruction;
  const instruction = environment.createInstruction(
    StoreClass,
    place,
    nodePath,
    leftPlace,
    rightPlace,
    "const",
  );
  functionBuilder.addInstruction(instruction);
  return place;
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

  // Store x = y.
  const { place: lvalPlace } = buildIdentifierAssignmentLeft(
    leftPath,
    nodePath,
    functionBuilder,
    environment,
  );
  const StoreClass = environment.contextDeclarationIds.has(declarationId)
    ? StoreContextInstruction
    : StoreLocalInstruction;
  functionBuilder.addInstruction(
    environment.createInstruction(
      StoreClass,
      environment.createPlace(environment.createIdentifier()),
      nodePath,
      lvalPlace,
      rightPlace,
      "const",
    ),
  );

  // _result = y;
  emitResultUpdate(bindingPlace, rightPlace, functionBuilder, environment);

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

  const rightPlace = buildAssignmentRight(nodePath, functionBuilder, moduleBuilder, environment);

  const leftPath: NodePath<t.AssignmentExpression["left"]> = nodePath.get("left");
  leftPath.assertMemberExpression();

  const objectPath = leftPath.get("object");
  const objectPlace = buildNode(objectPath, functionBuilder, moduleBuilder, environment);
  if (objectPlace === undefined || Array.isArray(objectPlace)) {
    throw new Error("Assignment expression left must be a single place");
  }

  if (isStaticMemberAccess(leftPath)) {
    const propertyPath: NodePath<t.MemberExpression["property"]> = leftPath.get("property");
    let property: string;
    if (propertyPath.isIdentifier()) {
      property = propertyPath.node.name;
    } else if (propertyPath.isStringLiteral()) {
      property = propertyPath.node.value;
    } else if (propertyPath.isNumericLiteral()) {
      property = String(propertyPath.node.value);
    } else {
      throw new Error(`Unexpected static member property type: ${propertyPath.type}`);
    }

    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    const instruction = environment.createInstruction(
      StoreStaticPropertyInstruction,
      place,
      nodePath,
      objectPlace,
      property,
      rightPlace,
    );
    functionBuilder.addInstruction(instruction);
    return place;
  } else {
    const propertyPath = leftPath.get("property");
    const propertyPlace = buildNode(propertyPath, functionBuilder, moduleBuilder, environment);
    if (propertyPlace === undefined || Array.isArray(propertyPlace)) {
      throw new Error("Assignment expression left must be a single place");
    }

    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    const instruction = environment.createInstruction(
      StoreDynamicPropertyInstruction,
      place,
      nodePath,
      objectPlace,
      propertyPlace,
      rightPlace,
    );
    functionBuilder.addInstruction(instruction);
    return place;
  }
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

  // Evaluate the object (and computed key if dynamic) once.
  const objectPath = leftPath.get("object");
  const objectPlace = buildNode(objectPath, functionBuilder, moduleBuilder, environment);
  if (objectPlace === undefined || Array.isArray(objectPlace)) {
    throw new Error("Logical member assignment object must be a single place");
  }

  const isStatic = isStaticMemberAccess(leftPath);
  let propertyName: string | undefined;
  let propertyPlace: Place | undefined;

  if (isStatic) {
    const propertyPath = leftPath.get("property");
    if (propertyPath.isIdentifier()) {
      propertyName = propertyPath.node.name;
    } else if (propertyPath.isStringLiteral()) {
      propertyName = propertyPath.node.value;
    } else if (propertyPath.isNumericLiteral()) {
      propertyName = String(propertyPath.node.value);
    } else {
      throw new Error(`Unexpected static member property type: ${propertyPath.type}`);
    }
  } else {
    const propertyPath = leftPath.get("property");
    const built = buildNode(propertyPath, functionBuilder, moduleBuilder, environment);
    if (built === undefined || Array.isArray(built)) {
      throw new Error("Logical member assignment computed property must be a single place");
    }
    propertyPlace = built;
  }

  // Load the property value once.
  const testPlace = environment.createPlace(environment.createIdentifier());
  if (isStatic) {
    functionBuilder.addInstruction(
      environment.createInstruction(
        LoadStaticPropertyInstruction,
        testPlace,
        nodePath,
        objectPlace,
        propertyName!,
      ),
    );
  } else {
    functionBuilder.addInstruction(
      environment.createInstruction(
        LoadDynamicPropertyInstruction,
        testPlace,
        nodePath,
        objectPlace,
        propertyPlace!,
      ),
    );
  }

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

  // Store the property.
  const storePlace = environment.createPlace(environment.createIdentifier());
  if (isStatic) {
    functionBuilder.addInstruction(
      environment.createInstruction(
        StoreStaticPropertyInstruction,
        storePlace,
        nodePath,
        objectPlace,
        propertyName!,
        rightPlace,
      ),
    );
  } else {
    functionBuilder.addInstruction(
      environment.createInstruction(
        StoreDynamicPropertyInstruction,
        storePlace,
        nodePath,
        objectPlace,
        propertyPlace!,
        rightPlace,
      ),
    );
  }

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
  emitResultUpdate(resultBinding, rightPlace, functionBuilder, environment);

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

  const leftPath: NodePath<t.AssignmentExpression["left"]> = nodePath.get("left");
  leftPath.assertLVal();
  const {
    place: leftPlace,
    instructions,
    identifiers,
    hasContext,
  } = buildAssignmentLeft(leftPath, nodePath, functionBuilder, moduleBuilder, environment);

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const StoreClass = hasContext ? StoreContextInstruction : StoreLocalInstruction;
  const instruction = environment.createInstruction(
    StoreClass,
    place,
    nodePath,
    leftPlace,
    rightPlace,
    "const",
    identifiers,
  );
  functionBuilder.addInstruction(instruction);

  for (const instruction of instructions) {
    functionBuilder.addInstruction(instruction);
  }
  return place;
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

  const loadLocalPlace = environment.createPlace(environment.createIdentifier());
  const loadLocalInstruction = environment.createInstruction(
    LoadLocalInstruction,
    loadLocalPlace,
    nodePath,
    place,
  );

  const objectPath = leftPath.get("object");
  const objectPlace = buildNode(objectPath, functionBuilder, moduleBuilder, environment);
  if (objectPlace === undefined || Array.isArray(objectPlace)) {
    throw new Error("Assignment expression left must be a single place");
  }

  const propertyPath: NodePath<t.MemberExpression["property"]> = leftPath.get("property");
  let property: string;
  if (propertyPath.isIdentifier()) {
    property = propertyPath.node.name;
  } else if (propertyPath.isStringLiteral()) {
    property = propertyPath.node.value;
  } else if (propertyPath.isNumericLiteral()) {
    property = String(propertyPath.node.value);
  } else {
    throw new Error(`Unexpected static member property type: ${propertyPath.type}`);
  }

  const storePropertyPlace = environment.createPlace(environment.createIdentifier());
  const storePropertyInstruction = environment.createInstruction(
    StoreStaticPropertyInstruction,
    storePropertyPlace,
    nodePath,
    objectPlace,
    property,
    loadLocalPlace,
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
    instructions: [loadLocalInstruction, storePropertyInstruction, expressionStatementInstruction],
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
