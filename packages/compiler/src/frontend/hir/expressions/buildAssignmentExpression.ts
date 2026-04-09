import type * as AST from "../../estree";
import type { AssignmentExpression, Expression, MemberExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  ArrayDestructureInstruction,
  ArrayPatternInstruction,
  BaseInstruction,
  BinaryExpressionInstruction,
  BranchTerminal,
  createInstructionId,
  DeclareLocalInstruction,
  type DestructureObjectProperty,
  type DestructureTarget,
  ExpressionStatementInstruction,
  JumpTerminal,
  LiteralInstruction,
  LoadLocalInstruction,
  ObjectDestructureInstruction,
  ObjectPropertyInstruction,
  Place,
  RestElementInstruction,
  StoreContextInstruction,
  StoreLocalInstruction,
  UnaryExpressionInstruction,
} from "../../../ir";
import { AssignmentPatternInstruction } from "../../../ir/instructions/pattern/AssignmentPattern";
import { ObjectPatternInstruction } from "../../../ir/instructions/pattern/ObjectPattern";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { buildBindingIdentifier, throwTDZAccessError } from "../buildIdentifier";
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
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  /** When true, the result is not used as an expression value (e.g. ExpressionStatement, for-loop update). */
  statementContext: boolean = false,
): Place {
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
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  statementContext: boolean,
): Place {
  const operator = node.operator;
  const left = node.left as AST.Identifier;
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

  let resultPlace: Place;
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

    const computedPlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(
        BinaryExpressionInstruction,
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

  const { place: leftPlace } = buildIdentifierAssignmentLeft(
    left,
    node,
    scope,
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
        leftPlace,
        resultPlace,
        "let",
        "assignment",
      )
    : environment.createInstruction(
        StoreLocalInstruction,
        place,
        leftPlace,
        resultPlace,
        "const",
        "assignment",
      );
  functionBuilder.addInstruction(instruction);
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
  valuePlace: Place,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  if (operator === "||=") {
    const place = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(UnaryExpressionInstruction, place, "!", valuePlace),
    );
    return place;
  }
  if (operator === "&&=") {
    return valuePlace;
  }
  // ??= : value == null (checks both null and undefined)
  const nullPlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(LiteralInstruction, nullPlace, null),
  );
  const place = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(BinaryExpressionInstruction, place, "==", valuePlace, nullPlace),
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
    environment.createInstruction(DeclareLocalInstruction, bindingPlace, "let"),
  );
  environment.registerDeclaration(
    bindingPlace.identifier.declarationId,
    functionBuilder.currentBlock.id,
    bindingPlace.id,
  );
  environment.ensureSyntheticDeclarationMetadata(bindingPlace.identifier.declarationId, "let", bindingPlace);
  const storePlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(
      StoreLocalInstruction,
      storePlace,
      bindingPlace,
      initialValue,
      "let",
      "declaration",
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
  environment.registerDeclaration(
    bindingPlace.identifier.declarationId,
    functionBuilder.currentBlock.id,
    updateBinding.id,
  );
  functionBuilder.addInstruction(
    environment.createInstruction(
      StoreLocalInstruction,
      environment.createPlace(environment.createIdentifier()),
      updateBinding,
      newValue,
      "const",
      "assignment",
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
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const operator = node.operator;
  const left = node.left as AST.Identifier;

  const declarationId = functionBuilder.getDeclarationId(left.name, scope);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${left.name}`);
  }

  if (functionBuilder.isDeclarationInTDZ(declarationId)) {
    throwTDZAccessError(functionBuilder.getDeclarationSourceName(declarationId) ?? left.name);
  }

  // Load x once — use buildBindingIdentifier to reuse the existing
  // declaration place (matching Babel's isReferencedIdentifier() = false
  // for the LHS of logical assignments).
  const testPlace = buildBindingIdentifier(left, scope, functionBuilder, environment);

  const conditionPlace = buildLogicalCondition(operator, testPlace, functionBuilder, environment);

  // let _result = x; -- holds the expression value across both paths.
  const { bindingPlace } = emitResultVariable(testPlace, functionBuilder, environment);
  const scopeId = functionBuilder.lexicalScopeIdFor(scope);

  const assignBlock = environment.createBlock(scopeId);
  functionBuilder.blocks.set(assignBlock.id, assignBlock);
  const mergeBlock = environment.createBlock(scopeId);
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

  const rightPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Logical assignment right must be a single place");
  }
  const stabilizedRightPlace = stabilizePlace(rightPlace, functionBuilder, environment);

  // Store x = y.
  const { place: lvalPlace } = buildIdentifierAssignmentLeft(
    left,
    node,
    scope,
    functionBuilder,
    environment,
  );
  const isContext = environment.contextDeclarationIds.has(declarationId);
  functionBuilder.addInstruction(
    isContext
      ? environment.createInstruction(
          StoreContextInstruction,
          environment.createPlace(environment.createIdentifier()),
          lvalPlace,
          stabilizedRightPlace,
          "let",
          "assignment",
        )
      : environment.createInstruction(
          StoreLocalInstruction,
          environment.createPlace(environment.createIdentifier()),
          lvalPlace,
          stabilizedRightPlace,
          "const",
          "assignment",
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
    environment.createInstruction(LoadLocalInstruction, resultPlace, bindingPlace),
  );
  return resultPlace;
}

function buildMemberExpressionAssignment(
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  statementContext: boolean,
): Place {
  const operator = node.operator;

  if (operator === "||=" || operator === "&&=" || operator === "??=") {
    return buildLogicalMemberAssignment(node, scope, functionBuilder, moduleBuilder, environment);
  }

  const left = node.left as MemberExpression;
  const reference = buildMemberReference(left, scope, functionBuilder, moduleBuilder, environment, {
    reusable: operator !== "=",
  });

  let rightPlace: Place;
  if (operator === "=") {
    rightPlace = buildAssignmentRight(node, scope, functionBuilder, moduleBuilder, environment);
  } else {
    const currentValuePlace = loadMemberReference(reference, functionBuilder, environment);

    const rhsPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
    if (rhsPlace === undefined || Array.isArray(rhsPlace)) {
      throw new Error("Assignment expression right must be a single place");
    }

    rightPlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(
        BinaryExpressionInstruction,
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
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const operator = node.operator;
  const left = node.left as MemberExpression;
  const reference = buildMemberReference(left, scope, functionBuilder, moduleBuilder, environment, {
    reusable: true,
  });

  // Load the property value once.
  const testPlace = loadMemberReference(reference, functionBuilder, environment);

  // let _result = testPlace; -- cache the property read. The condition
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
    environment.createInstruction(LoadLocalInstruction, cachedPlace, resultBinding),
  );
  const conditionPlace = buildLogicalCondition(operator, cachedPlace, functionBuilder, environment);
  const scopeId = functionBuilder.lexicalScopeIdFor(scope);

  const assignBlock = environment.createBlock(scopeId);
  functionBuilder.blocks.set(assignBlock.id, assignBlock);
  const mergeBlock = environment.createBlock(scopeId);
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

  const rightPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Logical member assignment right must be a single place");
  }
  const stabilizedRightPlace = stabilizePlace(rightPlace, functionBuilder, environment);

  // Store the property.
  const storePlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    createStoreMemberReferenceInstruction(reference, storePlace, stabilizedRightPlace, environment),
  );

  // Wrap the store in an ExpressionStatement so it emits as a statement.
  functionBuilder.addInstruction(
    environment.createInstruction(
      ExpressionStatementInstruction,
      environment.createPlace(environment.createIdentifier()),
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
    environment.createInstruction(LoadLocalInstruction, resultPlace, resultBinding),
  );
  return resultPlace;
}

function buildDestructuringAssignment(
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  statementContext: boolean,
): Place {
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

  const { target } = buildDestructureAssignmentTarget(
    left,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );

  const place = environment.createPlace(environment.createIdentifier());
  let instruction;
  if (target.kind === "array") {
    instruction = environment.createInstruction(
      ArrayDestructureInstruction,
      place,
      target.elements,
      resultPlace,
      "assignment",
      null,
    );
  } else if (target.kind === "object") {
    instruction = environment.createInstruction(
      ObjectDestructureInstruction,
      place,
      target.properties,
      resultPlace,
      "assignment",
      null,
    );
  } else {
    throw new Error(`Unsupported destructure target: ${target.kind}`);
  }
  functionBuilder.addInstruction(instruction);
  return resultPlace;
}

function buildDestructureAssignmentTarget(
  left: AST.Pattern | MemberExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { target: DestructureTarget; hasContext: boolean } {
  switch (left.type) {
    case "Identifier": {
      const declarationId = functionBuilder.getDeclarationId(left.name, scope);
      if (declarationId === undefined) {
        throw new Error(`Variable accessed before declaration: ${left.name}`);
      }

      if (environment.contextDeclarationIds.has(declarationId)) {
        const latestDeclaration = environment.getLatestDeclaration(declarationId);
        const existingPlace = environment.places.get(latestDeclaration.placeId);
        if (existingPlace === undefined) {
          throw new Error(`Unable to find the place for ${left.name} (${declarationId})`);
        }
        return {
          target: { kind: "binding", place: existingPlace, storage: "context" },
          hasContext: true,
        };
      }

      const bindingPlace = environment.getDeclarationBinding(declarationId);
      if (bindingPlace === undefined) {
        throw new Error(`Unable to find the binding for ${left.name} (${declarationId})`);
      }
      environment.registerDeclaration(declarationId, functionBuilder.currentBlock.id, bindingPlace.id);
      return {
        target: { kind: "binding", place: bindingPlace, storage: "local" },
        hasContext: false,
      };
    }
    case "MemberExpression": {
      const reference = buildMemberReference(left, scope, functionBuilder, moduleBuilder, environment);
      return {
        target:
          reference.kind === "static"
            ? {
                kind: "static-member",
                object: reference.object,
                property: reference.property,
                optional: reference.optional,
              }
            : {
                kind: "dynamic-member",
                object: reference.object,
                property: reference.property,
                optional: reference.optional,
              },
        hasContext: false,
      };
    }
    case "ArrayPattern": {
      let hasContext = false;
      const elements = left.elements.map((element) => {
        if (element === null) {
          return null;
        }
        const built = buildDestructureAssignmentTarget(
          element as AST.Pattern | MemberExpression,
          scope,
          functionBuilder,
          moduleBuilder,
          environment,
        );
        hasContext = hasContext || built.hasContext;
        return built.target;
      });
      return { target: { kind: "array", elements }, hasContext };
    }
    case "ObjectPattern": {
      let hasContext = false;
      const properties: DestructureObjectProperty[] = left.properties.map((property) => {
        if (property.type === "RestElement") {
          const built = buildDestructureAssignmentTarget(
            property.argument as AST.Pattern | MemberExpression,
            scope,
            functionBuilder,
            moduleBuilder,
            environment,
          );
          hasContext = hasContext || built.hasContext;
          return {
            key: "rest",
            computed: false,
            shorthand: false,
            value: { kind: "rest", argument: built.target },
          };
        }

        const built = buildDestructureAssignmentTarget(
          property.value as AST.Pattern | MemberExpression,
          scope,
          functionBuilder,
          moduleBuilder,
          environment,
        );
        hasContext = hasContext || built.hasContext;

        return {
          key: property.computed
            ? buildComputedAssignmentPropertyKey(
                property.key,
                scope,
                functionBuilder,
                moduleBuilder,
                environment,
              )
            : getStaticAssignmentPropertyKey(property.key),
          computed: property.computed,
          shorthand: property.shorthand,
          value: built.target,
        };
      });
      return { target: { kind: "object", properties }, hasContext };
    }
    case "AssignmentPattern": {
      const built = buildDestructureAssignmentTarget(
        left.left as AST.Pattern | MemberExpression,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      return {
        target: {
          kind: "assignment",
          left: built.target,
          right: buildRequiredAssignmentPlace(
            left.right,
            scope,
            functionBuilder,
            moduleBuilder,
            environment,
            "Assignment pattern right must be a single place",
          ),
        },
        hasContext: built.hasContext,
      };
    }
    case "RestElement": {
      const built = buildDestructureAssignmentTarget(
        left.argument as AST.Pattern | MemberExpression,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      return {
        target: { kind: "rest", argument: built.target },
        hasContext: built.hasContext,
      };
    }
  }

  throw new Error(`Unsupported destructuring assignment target: ${(left as { type: string }).type}`);
}

function buildRequiredAssignmentPlace(
  node: Expression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  message: string,
): Place {
  const place = buildNode(node, scope, functionBuilder, moduleBuilder, environment);
  if (place === undefined || Array.isArray(place)) {
    throw new Error(message);
  }
  return place;
}

function getStaticAssignmentPropertyKey(node: AST.Property["key"]): string | number {
  if (node.type === "PrivateIdentifier") {
    throw new Error("PrivateIdentifier is not supported in object pattern destructuring");
  }
  if (node.type === "Identifier") {
    return node.name;
  }
  if (node.type === "Literal" && (typeof node.value === "string" || typeof node.value === "number")) {
    return node.value;
  }
  throw new Error("Unsupported static key type in object pattern destructuring");
}

function buildComputedAssignmentPropertyKey(
  node: AST.Property["key"],
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  if (node.type === "PrivateIdentifier") {
    throw new Error("PrivateIdentifier is not supported in object pattern destructuring");
  }
  return buildRequiredAssignmentPlace(
    node,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
    "Object pattern key must be a single place",
  );
}

export function buildAssignmentLeft(
  left: AST.Pattern,
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; instructions: BaseInstruction[]; identifiers: Place[]; hasContext: boolean } {
  if (left.type === "Identifier") {
    return buildIdentifierAssignmentLeft(left, node, scope, functionBuilder, environment);
  } else if (left.type === "MemberExpression") {
    return buildMemberExpressionAssignmentLeft(
      left,
      node,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  } else if (left.type === "ArrayPattern") {
    return buildArrayPatternAssignmentLeft(
      left,
      node,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  } else if (left.type === "ObjectPattern") {
    return buildObjectPatternAssignmentLeft(
      left,
      node,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  } else if (left.type === "AssignmentPattern") {
    return buildAssignmentPatternAssignmentLeft(
      left,
      node,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  } else if (left.type === "RestElement") {
    return buildRestElementAssignmentLeft(
      left,
      node,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  throw new Error("Unsupported assignment left");
}

function buildIdentifierAssignmentLeft(
  left: AST.Identifier,
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): { place: Place; instructions: BaseInstruction[]; identifiers: Place[]; hasContext: boolean } {
  const declarationId = functionBuilder.getDeclarationId(left.name, scope);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${left.name}`);
  }

  // For context variables, reuse the original place rather than creating a
  // new SSA version -- context variables are not renamed by SSA.
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

  const bindingPlace = environment.getDeclarationBinding(declarationId);
  if (bindingPlace === undefined) {
    throw new Error(`Unable to find the binding for ${left.name} (${declarationId})`);
  }
  environment.registerDeclaration(declarationId, functionBuilder.currentBlock.id, bindingPlace.id);
  return { place: bindingPlace, instructions: [], identifiers: [bindingPlace], hasContext: false };
}

function buildMemberExpressionAssignmentLeft(
  left: MemberExpression,
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; instructions: BaseInstruction[]; identifiers: Place[]; hasContext: boolean } {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  functionBuilder.addInstruction(
    environment.createInstruction(DeclareLocalInstruction, place, "const"),
  );
  environment.registerDeclaration(
    identifier.declarationId,
    functionBuilder.currentBlock.id,
    place.id,
  );
  const reference = buildMemberReference(left, scope, functionBuilder, moduleBuilder, environment);
  const storePropertyPlace = environment.createPlace(environment.createIdentifier());
  const storePropertyInstruction = createStoreMemberReferenceInstruction(
    reference,
    storePropertyPlace,
    place,
    environment,
  );

  const expressionStatementPlace = environment.createPlace(environment.createIdentifier());
  const expressionStatementInstruction = environment.createInstruction(
    ExpressionStatementInstruction,
    expressionStatementPlace,
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
  left: AST.ArrayPattern,
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; instructions: BaseInstruction[]; identifiers: Place[]; hasContext: boolean } {
  const instructions: BaseInstruction[] = [];
  const identifiers: Place[] = [];
  let hasContext = false;

  const elementPlaces = left.elements.map((element) => {
    if (element == null) {
      return null;
    }

    const result = buildAssignmentLeft(
      element,
      node,
      scope,
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
    elementPlaces,
    identifiers,
  );
  functionBuilder.addInstruction(instruction);
  return { place, instructions, identifiers, hasContext };
}

function buildObjectPatternAssignmentLeft(
  left: AST.ObjectPattern,
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; instructions: BaseInstruction[]; identifiers: Place[]; hasContext: boolean } {
  const instructions: BaseInstruction[] = [];
  const identifiers: Place[] = [];
  let hasContext = false;

  const propertyPlaces = left.properties.map((property) => {
    if (property.type === "Property") {
      const key = property.key;
      let keyPlace;
      if (!property.computed && key.type === "Identifier") {
        // Non-computed identifier keys are property labels (string literals),
        // not variable references.  Emit a LiteralInstruction so the key
        // survives SSA transformations (clone/rewrite) unchanged.
        const keyIdentifier = environment.createIdentifier();
        keyPlace = environment.createPlace(keyIdentifier);
        const keyInstruction = environment.createInstruction(
          LiteralInstruction,
          keyPlace,
          key.name,
        );
        functionBuilder.addInstruction(keyInstruction);
      } else {
        keyPlace = buildNode(key, scope, functionBuilder, moduleBuilder, environment);
        if (keyPlace === undefined || Array.isArray(keyPlace)) {
          throw new Error("Object pattern key must be a single place");
        }
      }

      const value = property.value;
      const result = buildAssignmentLeft(
        value as AST.Pattern,
        node,
        scope,
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
        keyPlace,
        result.place,
        property.computed,
        property.shorthand,
        result.identifiers,
      );
      functionBuilder.addInstruction(instruction);
      return place;
    }

    if (property.type === "RestElement") {
      const argument = property.argument;
      const result = buildAssignmentLeft(
        argument,
        node,
        scope,
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
    propertyPlaces,
    identifiers,
  );
  functionBuilder.addInstruction(instruction);
  return { place, instructions, identifiers, hasContext };
}

function buildAssignmentPatternAssignmentLeft(
  left: AST.AssignmentPattern,
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; instructions: BaseInstruction[]; identifiers: Place[]; hasContext: boolean } {
  const {
    place: leftPlace,
    instructions,
    identifiers,
    hasContext,
  } = buildAssignmentLeft(left.left, node, scope, functionBuilder, moduleBuilder, environment);

  const rightPlace = buildNode(left.right, scope, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Assignment pattern right must be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    AssignmentPatternInstruction,
    place,
    leftPlace,
    rightPlace,
    identifiers,
  );
  functionBuilder.addInstruction(instruction);
  return { place, instructions, identifiers, hasContext };
}

function buildRestElementAssignmentLeft(
  left: AST.RestElement,
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; instructions: BaseInstruction[]; identifiers: Place[]; hasContext: boolean } {
  const {
    place: argumentPlace,
    instructions: argumentInstructions,
    identifiers,
    hasContext,
  } = buildAssignmentLeft(left.argument, node, scope, functionBuilder, moduleBuilder, environment);

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    RestElementInstruction,
    place,
    argumentPlace,
    identifiers,
  );
  functionBuilder.addInstruction(instruction);
  return { place, instructions: [...argumentInstructions], identifiers, hasContext };
}

function buildAssignmentRight(
  node: AssignmentExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
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

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  functionBuilder.addInstruction(
    environment.createInstruction(
      BinaryExpressionInstruction,
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
  functionBuilder: FunctionIRBuilder,
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
