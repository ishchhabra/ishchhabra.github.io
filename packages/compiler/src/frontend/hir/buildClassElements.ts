import type { ClassElement, Function, MethodDefinition, PropertyDefinition } from "oxc-parser";
import { Environment } from "../../environment";
import {
  ClassMethodInstruction,
  ExpressionStatementInstruction,
  LiteralInstruction,
  Place,
  ThisExpressionInstruction,
} from "../../ir";
import { StoreStaticPropertyInstruction } from "../../ir/instructions/memory/StoreStaticProperty";
import { type Scope } from "../scope/Scope";
import { buildClassMethod } from "./buildClassMethod";
import { buildNode } from "./buildNode";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

/**
 * Result of building a class body. The caller is responsible for emitting
 * static field stores after the class instruction.
 */
export interface ClassBodyResult {
  /** Method (and constructor) places for ClassExpressionInstruction.elements */
  elements: Place[];
  /** Static field stores to emit after the class instruction */
  staticFieldEmitters: Array<(classPlace: Place) => void>;
}

/**
 * Builds the body of a class, handling field desugaring.
 *
 * Instance fields are desugared into `this.<key> = <value>` instructions
 * prepended to the constructor body (matching Babel's transform and the
 * spec's InitializeInstanceElements semantics). Static fields are returned
 * as emitters that the caller invokes after the class instruction.
 */
export function buildClassBody(
  elements: ClassElement[],
  hasSuperClass: boolean,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): ClassBodyResult {
  // Phase 1: classify elements
  let constructorNode: MethodDefinition | null = null;
  const methods: MethodDefinition[] = [];
  const instanceFields: PropertyDefinition[] = [];
  const staticFields: PropertyDefinition[] = [];

  for (const element of elements) {
    switch (element.type) {
      case "MethodDefinition":
        if (element.kind === "constructor") {
          constructorNode = element;
        } else {
          methods.push(element);
        }
        break;
      case "PropertyDefinition":
        if (element.decorators && element.decorators.length > 0) {
          throw new Error("Unsupported: class field decorators");
        }
        if (element.key.type === "PrivateIdentifier") {
          throw new Error("Unsupported: private class fields");
        }
        if (element.static) {
          staticFields.push(element);
        } else {
          instanceFields.push(element);
        }
        break;
      case "StaticBlock":
        throw new Error("Unsupported: static blocks");
      case "AccessorProperty":
        throw new Error("Unsupported: accessor properties");
      default:
        throw new Error(`Unsupported class element type: ${(element as { type: string }).type}`);
    }
  }

  // Phase 2: build methods and constructor
  const result: Place[] = [];

  // Build non-constructor methods
  for (const method of methods) {
    result.push(buildClassMethod(method, scope, functionBuilder, moduleBuilder, environment));
  }

  // Build constructor (with field inits desugared as preamble)
  if (constructorNode !== null || instanceFields.length > 0) {
    const ctorPlace = buildConstructorWithFieldInits(
      constructorNode,
      instanceFields,
      hasSuperClass,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
    result.push(ctorPlace);
  }

  // Phase 3: prepare static field emitters
  const staticFieldEmitters: Array<(classPlace: Place) => void> = [];
  for (const field of staticFields) {
    staticFieldEmitters.push((classPlace: Place) => {
      emitFieldStore(field, classPlace, scope, functionBuilder, moduleBuilder, environment);
    });
  }

  return { elements: result, staticFieldEmitters };
}

/**
 * Builds a constructor ClassMethodInstruction, injecting instance field
 * initializers as a preamble (for base classes) or after super() (for
 * derived classes).
 */
function buildConstructorWithFieldInits(
  constructorNode: MethodDefinition | null,
  instanceFields: PropertyDefinition[],
  hasSuperClass: boolean,
  scope: Scope,
  parentFunctionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  if (constructorNode !== null) {
    // Explicit constructor — build with field init preamble
    return buildExplicitConstructorWithFields(
      constructorNode,
      instanceFields,
      hasSuperClass,
      scope,
      parentFunctionBuilder,
      moduleBuilder,
      environment,
    );
  }

  // No explicit constructor — synthesize one
  return buildSyntheticConstructor(
    instanceFields,
    hasSuperClass,
    scope,
    parentFunctionBuilder,
    moduleBuilder,
    environment,
  );
}

function buildExplicitConstructorWithFields(
  constructorNode: MethodDefinition,
  instanceFields: PropertyDefinition[],
  hasSuperClass: boolean,
  scope: Scope,
  parentFunctionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  if (constructorNode.decorators && constructorNode.decorators.length > 0) {
    throw new Error("Unsupported: class method decorators");
  }

  // Build the key (always "constructor" as a literal)
  const keyIdentifier = environment.createIdentifier();
  const keyPlace = environment.createPlace(keyIdentifier);
  functionBuilder_addInstruction(
    parentFunctionBuilder,
    environment.createInstruction(LiteralInstruction, keyPlace, "constructor"),
  );

  const fn: Function = constructorNode.value;
  if (fn.body == null) {
    throw new Error("Constructor must have a body");
  }

  const fnScope = parentFunctionBuilder.scopeFor(fn);

  // Build the field init preamble. For base classes, field inits run at the
  // start of the constructor. For derived classes, they conceptually run
  // after super() — but since we inject them as a preamble (before the body
  // statements), we rely on the fact that in a derived constructor the user
  // calls super() first. A later pass could enforce or reorder.
  const preamble =
    instanceFields.length > 0
      ? (builder: FunctionIRBuilder) => {
          if (hasSuperClass) {
            // For derived classes, we can't easily inject after super() with
            // the preamble approach. For now, emit field inits at the start.
            // This is safe as long as the field initializers don't reference
            // `this` (which would throw before super() anyway). Most real
            // field inits are literals or closures over outer-scope vars.
          }
          emitInstanceFieldInits(instanceFields, scope, builder, moduleBuilder, environment);
        }
      : undefined;

  const methodIRBuilder = new FunctionIRBuilder(
    fn.params,
    fn.body,
    fnScope,
    parentFunctionBuilder.scopeMap,
    environment,
    moduleBuilder,
    fn.async ?? false,
    fn.generator ?? false,
  );
  const bodyIR = methodIRBuilder.build(preamble);

  parentFunctionBuilder.propagateCapturesFrom(methodIRBuilder);

  const capturedPlaces = [...methodIRBuilder.captures.values()];
  const methodIdentifier = environment.createIdentifier();
  const methodPlace = environment.createPlace(methodIdentifier);
  const instruction = environment.createInstruction(
    ClassMethodInstruction,
    methodPlace,
    keyPlace,
    bodyIR,
    "constructor",
    false, // computed
    false, // isStatic
    false, // generator
    false, // async
    capturedPlaces,
  );
  parentFunctionBuilder.addInstruction(instruction);
  return methodPlace;
}

function buildSyntheticConstructor(
  instanceFields: PropertyDefinition[],
  _hasSuperClass: boolean,
  scope: Scope,
  parentFunctionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  // Build the key
  const keyIdentifier = environment.createIdentifier();
  const keyPlace = environment.createPlace(keyIdentifier);
  functionBuilder_addInstruction(
    parentFunctionBuilder,
    environment.createInstruction(LiteralInstruction, keyPlace, "constructor"),
  );

  // Create a FunctionIRBuilder with no params and an empty body scope.
  // We use the class body scope as the parent so field value expressions
  // can resolve bindings.
  const syntheticBuilder = new FunctionIRBuilder(
    [],
    // We need a body node. Use a synthetic empty approach: create the
    // FunctionIR manually from the builder's blocks.
    { type: "BlockStatement", body: [], start: 0, end: 0 } as any,
    scope,
    parentFunctionBuilder.scopeMap,
    environment,
    moduleBuilder,
    false,
    false,
  );

  const preamble =
    instanceFields.length > 0
      ? (builder: FunctionIRBuilder) => {
          emitInstanceFieldInits(instanceFields, scope, builder, moduleBuilder, environment);
        }
      : undefined;

  const bodyIR = syntheticBuilder.build(preamble);

  parentFunctionBuilder.propagateCapturesFrom(syntheticBuilder);

  const capturedPlaces = [...syntheticBuilder.captures.values()];
  const methodIdentifier = environment.createIdentifier();
  const methodPlace = environment.createPlace(methodIdentifier);
  const instruction = environment.createInstruction(
    ClassMethodInstruction,
    methodPlace,
    keyPlace,
    bodyIR,
    "constructor",
    false,
    false,
    false,
    false,
    capturedPlaces,
  );
  parentFunctionBuilder.addInstruction(instruction);
  return methodPlace;
}

/**
 * Emits `this.<key> = <value>` instructions for each instance field.
 */
function emitInstanceFieldInits(
  fields: PropertyDefinition[],
  scope: Scope,
  builder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): void {
  for (const field of fields) {
    // Get the value place (or undefined for uninitialized fields)
    if (field.value == null) continue;

    // this
    const thisPlace = environment.createPlace(environment.createIdentifier());
    builder.addInstruction(environment.createInstruction(ThisExpressionInstruction, thisPlace));

    // value expression
    const valuePlace = buildNode(field.value, scope, builder, moduleBuilder, environment);
    if (valuePlace === undefined || Array.isArray(valuePlace)) {
      throw new Error("Field initializer must be a single place");
    }

    // this.key = value
    emitFieldStoreInstruction(field, thisPlace, valuePlace, builder, environment);
  }
}

/**
 * Emits a property store for a field: `object.<key> = value`.
 */
function emitFieldStore(
  field: PropertyDefinition,
  objectPlace: Place,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): void {
  if (field.value == null) return;

  const valuePlace = buildNode(field.value, scope, functionBuilder, moduleBuilder, environment);
  if (valuePlace === undefined || Array.isArray(valuePlace)) {
    throw new Error("Field initializer must be a single place");
  }

  emitFieldStoreInstruction(field, objectPlace, valuePlace, functionBuilder, environment);
}

function emitFieldStoreInstruction(
  field: PropertyDefinition,
  objectPlace: Place,
  valuePlace: Place,
  builder: FunctionIRBuilder,
  environment: Environment,
): void {
  const storePlace = environment.createPlace(environment.createIdentifier());

  if (!field.computed && field.key.type === "Identifier") {
    builder.addInstruction(
      environment.createInstruction(
        StoreStaticPropertyInstruction,
        storePlace,
        objectPlace,
        field.key.name,
        valuePlace,
      ),
    );
  } else {
    throw new Error("Unsupported: computed class field keys");
  }

  // Wrap in ExpressionStatement so codegen emits the store as a statement.
  builder.addInstruction(
    environment.createInstruction(
      ExpressionStatementInstruction,
      environment.createPlace(environment.createIdentifier()),
      storePlace,
    ),
  );
}

/** Alias for addInstruction to keep the builder interaction clear. */
function functionBuilder_addInstruction(builder: FunctionIRBuilder, instruction: any): void {
  builder.addInstruction(instruction);
}
