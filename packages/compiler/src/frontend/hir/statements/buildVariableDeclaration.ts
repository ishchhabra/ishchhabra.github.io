import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import {
  ArrayPatternInstruction,
  BindingIdentifierInstruction,
  LiteralInstruction,
  ObjectPropertyInstruction,
  Place,
  RestElementInstruction,
  StoreContextInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { AssignmentPatternInstruction } from "../../../ir/instructions/pattern/AssignmentPattern";
import { ObjectPatternInstruction } from "../../../ir/instructions/pattern/ObjectPattern";
import { buildBindingIdentifier } from "../buildIdentifier";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { getValueFromStaticKey } from "../getValueFromStaticKey";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildVariableDeclaration(
  nodePath: NodePath<t.VariableDeclaration>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place | Place[] | undefined {
  const declarations = nodePath.get("declarations");
  const declarationPlaces = declarations.map((declaration) => {
    const id = declaration.get("id") as NodePath<t.LVal>;
    const init: NodePath<t.Expression | null | undefined> = declaration.get("init");

    let valuePlace: Place | Place[] | undefined;
    if (!init.hasNode()) {
      init.replaceWith(t.identifier("undefined"));
      init.assertIdentifier({ name: "undefined" });
      valuePlace = buildNode(init, functionBuilder, moduleBuilder, environment);
    } else {
      valuePlace = buildNode(init, functionBuilder, moduleBuilder, environment);
    }
    if (valuePlace === undefined || Array.isArray(valuePlace)) {
      throw new Error("Value place must be a single place");
    }

    let { place: lvalPlace, identifiers: lvalIdentifiers } = buildVariableDeclaratorLVal(
      id,
      functionBuilder,
      moduleBuilder,
      environment,
    );

    // var declarations have a hoisted `undefined` init from the bindings
    // pass. Create a fresh SSA Place (like an assignment) so this store
    // is a distinct definition from the hoisted one.
    if (nodePath.node.kind === "var" && id.isIdentifier()) {
      const declId = functionBuilder.getDeclarationId(id.node.name, id);
      if (declId !== undefined) {
        const newPlace = environment.createPlace(environment.createIdentifier(declId));
        functionBuilder.addInstruction(
          environment.createInstruction(BindingIdentifierInstruction, newPlace, nodePath),
        );
        environment.registerDeclaration(declId, functionBuilder.currentBlock.id, newPlace.id);
        lvalPlace = newPlace;
        lvalIdentifiers = [newPlace];
      }
    }

    if (lvalPlace === undefined || Array.isArray(lvalPlace)) {
      throw new Error("Lval place must be a single place");
    }

    const isContext = lvalIdentifiers.some((p) =>
      environment.contextDeclarationIds.has(p.identifier.declarationId),
    );
    const isPattern =
      id.isArrayPattern() || id.isObjectPattern() || id.isAssignmentPattern() || id.isRestElement();
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    const instruction = isContext
      ? environment.createInstruction(
          StoreContextInstruction,
          place,
          nodePath,
          lvalPlace,
          valuePlace,
          "let",
          isPattern ? lvalIdentifiers : [],
        )
      : environment.createInstruction(
          StoreLocalInstruction,
          place,
          nodePath,
          lvalPlace,
          valuePlace,
          "const",
          isPattern ? lvalIdentifiers : [],
        );
    functionBuilder.addInstruction(instruction);
    lvalIdentifiers.forEach((lvalIdentifier) => {
      environment.registerDeclarationInstruction(lvalIdentifier, instruction);

      const declPlaces = environment.declToPlaces.get(lvalIdentifier.identifier.declarationId);
      if (declPlaces) {
        const entry = declPlaces.find((p) => p.placeId === lvalIdentifier.id);
        if (entry) {
          entry.blockId = functionBuilder.currentBlock.id;
        }
      }
    });

    return place;
  });

  return declarationPlaces;
}

export function buildVariableDeclaratorLVal(
  nodePath: NodePath<t.LVal>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; identifiers: Place[] } {
  if (nodePath.isIdentifier()) {
    return buildIdentifierVariableDeclaratorLVal(nodePath, functionBuilder, environment);
  }
  if (nodePath.isArrayPattern()) {
    return buildArrayPatternVariableDeclaratorLVal(
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (nodePath.isObjectPattern()) {
    return buildObjectPatternVariableDeclaratorLVal(
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (nodePath.isAssignmentPattern()) {
    return buildAssignmentPatternVariableDeclaratorLVal(
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (nodePath.isRestElement()) {
    return buildRestElementVariableDeclaratorLVal(
      nodePath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  throw new Error("Unsupported variable declarator lval");
}

function buildIdentifierVariableDeclaratorLVal(
  nodePath: NodePath<t.Identifier>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): { place: Place; identifiers: Place[] } {
  const place = buildBindingIdentifier(nodePath, functionBuilder, environment);
  functionBuilder.markDeclarationInitialized(place.identifier.declarationId);
  return { place, identifiers: [place] };
}

function buildArrayPatternVariableDeclaratorLVal(
  nodePath: NodePath<t.ArrayPattern>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; identifiers: Place[] } {
  const identifiers: Place[] = [];

  const elementPaths = nodePath.get("elements");
  const elementPlaces = elementPaths.map(
    (elementPath: NodePath<t.ArrayPattern["elements"][number]>) => {
      if (!elementPath.hasNode()) {
        return null;
      }

      elementPath.assertLVal();
      const { place, identifiers: elementIdentifiers } = buildVariableDeclaratorLVal(
        elementPath,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      identifiers.push(...elementIdentifiers);
      return place;
    },
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ArrayPatternInstruction,
    place,
    nodePath,
    elementPlaces,
    identifiers,
  );
  functionBuilder.addInstruction(instruction);
  return { place, identifiers };
}

function buildObjectPatternVariableDeclaratorLVal(
  nodePath: NodePath<t.ObjectPattern>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; identifiers: Place[] } {
  const identifiers: Place[] = [];

  const propertyPaths = nodePath.get("properties");
  const propertyPlaces = propertyPaths.map((propertyPath) => {
    if (propertyPath.isObjectProperty()) {
      const keyPath: NodePath<t.ObjectProperty["key"]> = propertyPath.get("key");

      let keyPlace: Place;
      if (propertyPath.node.computed) {
        // Computed keys are variable references, so emit them through buildNode
        // to preserve their evaluation in the instruction stream.
        const p = buildNode(keyPath, functionBuilder, moduleBuilder, environment);
        if (p === undefined || Array.isArray(p)) {
          throw new Error("Object pattern computed key must be a single place");
        }
        keyPlace = p;
      } else {
        keyPlace = buildObjectPropertyKeyVariableDeclaratorLVal(
          keyPath,
          functionBuilder,
          environment,
        );
      }

      const valuePath: NodePath<t.ObjectProperty["value"]> = propertyPath.get("value");
      valuePath.assertLVal();
      const { place: valuePlace, identifiers: valueIdentifiers } = buildVariableDeclaratorLVal(
        valuePath,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      identifiers.push(...valueIdentifiers);

      const identifier = environment.createIdentifier();
      const place = environment.createPlace(identifier);
      const instruction = environment.createInstruction(
        ObjectPropertyInstruction,
        place,
        nodePath,
        keyPlace,
        valuePlace,
        propertyPath.node.computed,
        false,
        valueIdentifiers,
      );
      functionBuilder.addInstruction(instruction);
      return place;
    }

    if (propertyPath.isRestElement()) {
      const argumentPath = propertyPath.get("argument");
      const { place: argumentPlace, identifiers: argumentIdentifiers } =
        buildVariableDeclaratorLVal(argumentPath, functionBuilder, moduleBuilder, environment);
      identifiers.push(...argumentIdentifiers);

      const identifier = environment.createIdentifier();
      const place = environment.createPlace(identifier);
      const instruction = environment.createInstruction(
        RestElementInstruction,
        place,
        propertyPath,
        argumentPlace,
        argumentIdentifiers,
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
    nodePath,
    propertyPlaces,
    identifiers,
  );
  functionBuilder.addInstruction(instruction);
  return { place, identifiers };
}

function buildObjectPropertyKeyVariableDeclaratorLVal(
  nodePath: NodePath,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  // Non-computed destructuring keys are property labels, not variable reads.
  const value = getValueFromStaticKey(nodePath);
  if (value === undefined) {
    throw new Error("Unsupported static key type in object pattern destructuring");
  }
  const keyIdentifier = environment.createIdentifier();
  const keyPlace = environment.createPlace(keyIdentifier);
  const keyInstruction = environment.createInstruction(
    LiteralInstruction,
    keyPlace,
    nodePath,
    value,
  );
  functionBuilder.addInstruction(keyInstruction);
  return keyPlace;
}

function buildAssignmentPatternVariableDeclaratorLVal(
  nodePath: NodePath<t.AssignmentPattern>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; identifiers: Place[] } {
  const rightPath = nodePath.get("right");
  const rightPlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Right place must be a single place");
  }

  const leftPath = nodePath.get("left");
  const { place: leftPlace, identifiers: leftIdentifiers } = buildVariableDeclaratorLVal(
    leftPath,
    functionBuilder,
    moduleBuilder,
    environment,
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    AssignmentPatternInstruction,
    place,
    nodePath,
    leftPlace,
    rightPlace,
    leftIdentifiers,
  );
  functionBuilder.addInstruction(instruction);
  return { place, identifiers: leftIdentifiers };
}

function buildRestElementVariableDeclaratorLVal(
  nodePath: NodePath<t.RestElement>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { place: Place; identifiers: Place[] } {
  const argumentPath = nodePath.get("argument");
  const { place: argumentPlace, identifiers: argumentIdentifiers } = buildVariableDeclaratorLVal(
    argumentPath,
    functionBuilder,
    moduleBuilder,
    environment,
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    RestElementInstruction,
    place,
    nodePath,
    argumentPlace,
    argumentIdentifiers,
  );
  functionBuilder.addInstruction(instruction);
  return { place, identifiers: argumentIdentifiers };
}
