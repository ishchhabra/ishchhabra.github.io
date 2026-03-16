import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import {
  BinaryExpressionInstruction,
  BindingIdentifierInstruction,
  ConditionalExpressionInstruction,
  LoadDynamicPropertyInstruction,
  LoadGlobalInstruction,
  Place,
  StoreContextInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { LoadStaticPropertyInstruction } from "../../../ir/instructions/memory/LoadStaticProperty";
import { buildBindingIdentifier } from "../buildIdentifier";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

/**
 * Lowers a destructuring declaration to individual property accesses.
 *
 * `const { a, b } = expr` becomes:
 *   const $tmp = expr;
 *   const $a = $tmp.a;
 *   const $b = $tmp.b;
 */
export function buildDestructuring(
  patternPath: NodePath<t.ObjectPattern | t.ArrayPattern>,
  initPath: NodePath<t.Expression>,
  nodePath: NodePath<t.VariableDeclaration>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  // Build the init expression → exprPlace
  const exprPlace = buildNode(initPath, functionBuilder, moduleBuilder, environment);
  if (exprPlace === undefined || Array.isArray(exprPlace)) {
    throw new Error("Init expression must be a single place");
  }

  // Create temp: BI($tmp) + StoreLocal(tmpPlace, exprPlace)
  const tmpIdentifier = environment.createIdentifier();
  const tmpPlace = environment.createPlace(tmpIdentifier);
  const tmpBindingInstruction = environment.createInstruction(
    BindingIdentifierInstruction,
    tmpPlace,
    nodePath,
  );
  functionBuilder.addInstruction(tmpBindingInstruction);

  const tmpStoreIdentifier = environment.createIdentifier();
  const tmpStorePlace = environment.createPlace(tmpStoreIdentifier);
  const tmpStoreInstruction = environment.createInstruction(
    StoreLocalInstruction,
    tmpStorePlace,
    nodePath,
    tmpPlace,
    exprPlace,
    "const",
  );
  functionBuilder.addInstruction(tmpStoreInstruction);

  // Lower the pattern to individual property accesses
  const identifiers = buildDestructuringPattern(
    tmpPlace,
    patternPath,
    nodePath,
    functionBuilder,
    moduleBuilder,
    environment,
    "const",
  );

  // Update declToPlaces for each binding
  for (const bindingPlace of identifiers) {
    const declPlaces = environment.declToPlaces.get(bindingPlace.identifier.declarationId);
    if (declPlaces) {
      const entry = declPlaces.find((p) => p.placeId === bindingPlace.id);
      if (entry) {
        entry.blockId = functionBuilder.currentBlock.id;
      }
    }
  }

  return tmpStorePlace;
}

/**
 * Recursively lowers a destructuring pattern into individual LoadStaticProperty
 * + StoreLocal chains. Returns the binding Places for all identifiers in the pattern.
 */
function buildDestructuringPattern(
  sourcePlace: Place,
  patternPath: NodePath<t.LVal>,
  nodePath: NodePath<t.VariableDeclaration>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "const" | "let" | "var",
): Place[] {
  if (patternPath.isObjectPattern()) {
    return buildDestructuringObjectPattern(
      sourcePlace,
      patternPath,
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
      kind,
    );
  }
  if (patternPath.isArrayPattern()) {
    return buildDestructuringArrayPattern(
      sourcePlace,
      patternPath,
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
      kind,
    );
  }
  throw new Error(`Unsupported pattern type for lowering: ${patternPath.type}`);
}

function buildDestructuringObjectPattern(
  sourcePlace: Place,
  patternPath: NodePath<t.ObjectPattern>,
  nodePath: NodePath<t.VariableDeclaration>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "const" | "let" | "var",
): Place[] {
  const identifiers: Place[] = [];
  const properties = patternPath.get("properties");

  for (const prop of properties) {
    if (!prop.isObjectProperty()) {
      throw new Error(`Unexpected property type in lowered object pattern: ${prop.type}`);
    }

    const keyPath: NodePath<t.ObjectProperty["key"]> = prop.get("key");
    let loadPlace: Place;

    if (prop.node.computed) {
      // Computed key: build the key expression and use LoadDynamicProperty
      const keyPlace = buildNode(keyPath, functionBuilder, moduleBuilder, environment);
      if (keyPlace === undefined || Array.isArray(keyPlace)) {
        throw new Error("Computed key must be a single place");
      }
      loadPlace = buildLoadDynamicProperty(
        sourcePlace,
        keyPlace,
        nodePath,
        functionBuilder,
        environment,
      );
    } else {
      // Static key: use LoadStaticProperty
      if (!keyPath.isIdentifier()) {
        throw new Error("Non-computed object pattern key must be an identifier");
      }
      loadPlace = buildLoadStaticProperty(
        sourcePlace,
        (keyPath as NodePath<t.Identifier>).node.name,
        nodePath,
        functionBuilder,
        environment,
      );
    }

    const valuePath: NodePath<t.ObjectProperty["value"]> = prop.get("value");
    if (!valuePath.isLVal()) {
      throw new Error("Object pattern value must be an LVal");
    }

    const bindings = buildDestructuringBinding(
      loadPlace,
      valuePath as NodePath<t.LVal>,
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
      kind,
    );
    identifiers.push(...bindings);
  }

  return identifiers;
}

function buildDestructuringArrayPattern(
  sourcePlace: Place,
  patternPath: NodePath<t.ArrayPattern>,
  nodePath: NodePath<t.VariableDeclaration>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "const" | "let" | "var",
): Place[] {
  const identifiers: Place[] = [];
  const elements = patternPath.get("elements");

  for (let i = 0; i < elements.length; i++) {
    const elementPath = elements[i];
    if (!elementPath.hasNode()) continue;
    if (!elementPath.isLVal()) {
      throw new Error("Array pattern element must be an LVal");
    }

    const loadPlace = buildLoadStaticProperty(
      sourcePlace,
      String(i),
      nodePath,
      functionBuilder,
      environment,
    );

    const bindings = buildDestructuringBinding(
      loadPlace,
      elementPath as NodePath<t.LVal>,
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
      kind,
    );
    identifiers.push(...bindings);
  }

  return identifiers;
}

/**
 * Lowers a single binding target within a destructuring pattern.
 * Handles identifiers, assignment patterns (defaults), and nested patterns.
 */
function buildDestructuringBinding(
  loadedPlace: Place,
  targetPath: NodePath<t.LVal>,
  nodePath: NodePath<t.VariableDeclaration>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "const" | "let" | "var",
): Place[] {
  if (targetPath.isIdentifier()) {
    return buildStoreBinding(loadedPlace, targetPath, nodePath, functionBuilder, environment, kind);
  }

  if (targetPath.isAssignmentPattern()) {
    return buildDestructuringAssignmentPattern(
      loadedPlace,
      targetPath,
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
      kind,
    );
  }

  if (targetPath.isObjectPattern() || targetPath.isArrayPattern()) {
    return buildDestructuringPattern(
      loadedPlace,
      targetPath,
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
      kind,
    );
  }

  throw new Error(`Unsupported binding target: ${targetPath.type}`);
}

/**
 * Lowers a default value assignment pattern.
 *
 * `const { a = defaultVal } = expr` becomes:
 *   LoadGlobal("undefined") → undefinedPlace
 *   BinaryExpression(loadedA, "===", undefinedPlace) → testPlace
 *   <build default> → defaultPlace
 *   ConditionalExpression(testPlace, defaultPlace, loadedA) → resultPlace
 *   BI($a) + StoreLocal($a, resultPlace)
 */
function buildDestructuringAssignmentPattern(
  loadedPlace: Place,
  assignmentPath: NodePath<t.AssignmentPattern>,
  nodePath: NodePath<t.VariableDeclaration>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "const" | "let" | "var",
): Place[] {
  const resultPlace = buildDefaultCheck(
    loadedPlace,
    assignmentPath,
    functionBuilder,
    moduleBuilder,
    environment,
  );

  const leftPath = assignmentPath.get("left");
  return buildDestructuringBinding(
    resultPlace,
    leftPath,
    nodePath,
    functionBuilder,
    moduleBuilder,
    environment,
    kind,
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildLoadStaticProperty(
  sourcePlace: Place,
  property: string,
  nodePath: NodePath<t.Node>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    LoadStaticPropertyInstruction,
    place,
    nodePath,
    sourcePlace,
    property,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}

function buildLoadDynamicProperty(
  sourcePlace: Place,
  propertyPlace: Place,
  nodePath: NodePath<t.Node>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    LoadDynamicPropertyInstruction,
    place,
    nodePath,
    sourcePlace,
    propertyPlace,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}

function buildStoreBinding(
  valuePlace: Place,
  identifierPath: NodePath<t.Identifier>,
  nodePath: NodePath<t.VariableDeclaration>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  kind: "const" | "let" | "var",
): Place[] {
  const bindingPlace = buildBindingIdentifier(identifierPath, functionBuilder, environment);

  const isContext = environment.contextDeclarationIds.has(bindingPlace.identifier.declarationId);
  const StoreClass = isContext ? StoreContextInstruction : StoreLocalInstruction;
  const storeIdentifier = environment.createIdentifier();
  const storePlace = environment.createPlace(storeIdentifier);
  const storeInstruction = environment.createInstruction(
    StoreClass,
    storePlace,
    nodePath,
    bindingPlace,
    valuePlace,
    isContext ? "let" : kind,
  );
  functionBuilder.addInstruction(storeInstruction);
  environment.registerDeclarationInstruction(bindingPlace, storeInstruction);

  return [bindingPlace];
}

function buildDefaultCheck(
  loadedPlace: Place,
  assignmentPath: NodePath<t.AssignmentPattern>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const undefinedIdentifier = environment.createIdentifier();
  const undefinedPlace = environment.createPlace(undefinedIdentifier);
  functionBuilder.addInstruction(
    environment.createInstruction(
      LoadGlobalInstruction,
      undefinedPlace,
      assignmentPath,
      "undefined",
    ),
  );

  const testIdentifier = environment.createIdentifier();
  const testPlace = environment.createPlace(testIdentifier);
  functionBuilder.addInstruction(
    environment.createInstruction(
      BinaryExpressionInstruction,
      testPlace,
      assignmentPath,
      "===",
      loadedPlace,
      undefinedPlace,
    ),
  );

  const rightPath = assignmentPath.get("right");
  const defaultPlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
  if (defaultPlace === undefined || Array.isArray(defaultPlace)) {
    throw new Error("Default value must be a single place");
  }

  const resultIdentifier = environment.createIdentifier();
  const resultPlace = environment.createPlace(resultIdentifier);
  functionBuilder.addInstruction(
    environment.createInstruction(
      ConditionalExpressionInstruction,
      resultPlace,
      assignmentPath,
      testPlace,
      defaultPlace,
      loadedPlace,
    ),
  );

  return resultPlace;
}
