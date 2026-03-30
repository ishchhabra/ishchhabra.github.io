import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../environment";
import {
  ArrayPatternInstruction,
  LiteralInstruction,
  ObjectPropertyInstruction,
  Place,
  RestElementInstruction,
} from "../../ir";
import { AssignmentPatternInstruction } from "../../ir/instructions/pattern/AssignmentPattern";
import { ObjectPatternInstruction } from "../../ir/instructions/pattern/ObjectPattern";
import { instantiateFunctionParamBindings } from "./bindings/instantiateFunctionParamBindings";
import { buildNode } from "./buildNode";
import { getValueFromStaticKey } from "./getValueFromStaticKey";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

export interface BuiltFunctionParam {
  place: Place;
  paramBindings: Place[];
}

/**
 * One formal parameter after lowering: the param root `place` and the root
 * header instruction `paramBindings` (empty for a simple identifier param).
 */
interface ParamBuildResult {
  place: Place;
  identifiers: Place[];
  paramBindings: Place[];
}

export function buildFunctionParams(
  paramPaths: NodePath<t.Identifier | t.RestElement | t.Pattern>[],
  bodyPath: NodePath,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): BuiltFunctionParam[] {
  instantiateFunctionParamBindings(paramPaths, bodyPath, functionBuilder, environment);

  return paramPaths.map((paramPath: NodePath<t.Identifier | t.RestElement | t.Pattern>) => {
    const result = buildFunctionParam(
      paramPath as NodePath<t.LVal>,
      bodyPath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
    return { place: result.place, paramBindings: result.paramBindings };
  });
}

function buildFunctionParam(
  paramPath: NodePath<t.LVal>,
  bodyPath: NodePath,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): ParamBuildResult {
  if (paramPath.isIdentifier()) {
    return buildFunctionIdentifierParam(paramPath, functionBuilder, environment);
  }
  if (paramPath.isArrayPattern()) {
    return buildFunctionArrayPatternParam(
      paramPath,
      bodyPath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (paramPath.isObjectPattern()) {
    return buildFunctionObjectPatternParam(
      paramPath,
      bodyPath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (paramPath.isAssignmentPattern()) {
    return buildFunctionAssignmentPatternParam(
      paramPath,
      bodyPath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (paramPath.isRestElement()) {
    return buildFunctionRestElementParam(
      paramPath,
      bodyPath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  throw new Error(`Unsupported param type: ${paramPath.node.type}`);
}

function buildFunctionIdentifierParam(
  paramPath: NodePath<t.Identifier>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): ParamBuildResult {
  const name = paramPath.node.name;
  const declarationId = functionBuilder.getDeclarationId(name, paramPath);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${name}`);
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId);
  const place = environment.places.get(latestDeclaration.placeId);
  if (place === undefined) {
    throw new Error(`Unable to find the place for ${name} (${declarationId})`);
  }

  functionBuilder.markDeclarationInitialized(declarationId);
  return { place, identifiers: [place], paramBindings: [] };
}

function buildFunctionArrayPatternParam(
  paramPath: NodePath<t.ArrayPattern>,
  bodyPath: NodePath,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): ParamBuildResult {
  const identifiers: Place[] = [];
  const elements = paramPath.get("elements");
  const places = elements.map((elementPath) => {
    // Holes in array patterns (e.g. `function([,b]){}`) are structural markers
    // in the pattern shape, not values in the data-flow graph.
    if (!elementPath.hasNode()) {
      return null;
    }

    const result = buildFunctionParam(
      elementPath as NodePath<t.LVal>,
      bodyPath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
    identifiers.push(...result.identifiers);
    return result.place;
  });

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ArrayPatternInstruction,
    place,
    paramPath,
    places,
    identifiers,
  );
  functionBuilder.header.push(instruction);
  return { place, identifiers, paramBindings: identifiers };
}

function buildFunctionObjectPatternParam(
  paramPath: NodePath<t.ObjectPattern>,
  bodyPath: NodePath,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): ParamBuildResult {
  const identifiers: Place[] = [];
  const propertyPaths = paramPath.get("properties");
  const propertyPlaces = propertyPaths.map((propertyPath) => {
    if (propertyPath.isObjectProperty()) {
      const keyPath = propertyPath.get("key");
      let keyPlace: Place;
      if (propertyPath.node.computed) {
        // Computed keys emit normal value instructions; move them into the
        // function header so param codegen can resolve them during emission.
        const insertPoint = functionBuilder.currentBlock.instructions.length;
        const p = buildNode(keyPath, functionBuilder, moduleBuilder, environment);
        if (p === undefined || Array.isArray(p)) {
          throw new Error("Object pattern computed key must be a single place");
        }
        const keyInstructions = functionBuilder.currentBlock.instructions.splice(insertPoint);
        functionBuilder.header.push(...keyInstructions);
        keyPlace = p;
      } else {
        keyPlace = buildFunctionObjectPropertyKey(keyPath, functionBuilder, environment);
      }

      const valuePath = propertyPath.get("value");
      const valueResult = buildFunctionParam(
        valuePath as NodePath<t.LVal>,
        bodyPath,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      identifiers.push(...valueResult.identifiers);

      const identifier = environment.createIdentifier();
      const place = environment.createPlace(identifier);
      const instruction = environment.createInstruction(
        ObjectPropertyInstruction,
        place,
        paramPath,
        keyPlace,
        valueResult.place,
        propertyPath.node.computed,
        propertyPath.node.shorthand,
        valueResult.identifiers,
      );
      functionBuilder.header.push(instruction);
      return place;
    }

    if (propertyPath.isRestElement()) {
      const argumentPath = propertyPath.get("argument");
      const argumentResult = buildFunctionParam(
        argumentPath as NodePath<t.LVal>,
        bodyPath,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      identifiers.push(...argumentResult.identifiers);

      const identifier = environment.createIdentifier();
      const place = environment.createPlace(identifier);
      const instruction = environment.createInstruction(
        RestElementInstruction,
        place,
        propertyPath,
        argumentResult.place,
        argumentResult.identifiers,
      );
      functionBuilder.header.push(instruction);
      return place;
    }

    throw new Error("Unsupported object pattern property");
  });

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ObjectPatternInstruction,
    place,
    paramPath,
    propertyPlaces,
    identifiers,
  );
  functionBuilder.header.push(instruction);
  return { place, identifiers, paramBindings: identifiers };
}

function buildFunctionObjectPropertyKey(
  keyPath: NodePath,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  // Non-computed parameter destructuring keys are property labels
  // (identifiers, strings, numbers), not variable references.
  const value = getValueFromStaticKey(keyPath);
  if (value === undefined) {
    throw new Error("Unsupported static key type in object pattern destructuring");
  }
  const keyIdentifier = environment.createIdentifier();
  const keyPlace = environment.createPlace(keyIdentifier);
  const keyInstruction = environment.createInstruction(
    LiteralInstruction,
    keyPlace,
    keyPath,
    value,
  );
  functionBuilder.header.push(keyInstruction);
  return keyPlace;
}

function buildFunctionAssignmentPatternParam(
  paramPath: NodePath<t.AssignmentPattern>,
  bodyPath: NodePath,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): ParamBuildResult {
  // buildNode emits instructions into the current block, but parameter default
  // value instructions must live in the function header for codegen.
  const insertPoint = functionBuilder.currentBlock.instructions.length;
  const rightPath = paramPath.get("right");
  const rightPlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Default value must be a single expression");
  }
  const defaultValueInstructions = functionBuilder.currentBlock.instructions.splice(insertPoint);
  functionBuilder.header.push(...defaultValueInstructions);

  const leftPath = paramPath.get("left");
  const leftResult = buildFunctionParam(
    leftPath as NodePath<t.LVal>,
    bodyPath,
    functionBuilder,
    moduleBuilder,
    environment,
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    AssignmentPatternInstruction,
    place,
    paramPath,
    leftResult.place,
    rightPlace,
    leftResult.identifiers,
  );
  functionBuilder.header.push(instruction);
  return {
    place,
    identifiers: leftResult.identifiers,
    paramBindings: leftResult.identifiers,
  };
}

function buildFunctionRestElementParam(
  paramPath: NodePath<t.RestElement>,
  bodyPath: NodePath,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): ParamBuildResult {
  const argumentPath = paramPath.get("argument");
  const argumentResult = buildFunctionParam(
    argumentPath as NodePath<t.LVal>,
    bodyPath,
    functionBuilder,
    moduleBuilder,
    environment,
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    RestElementInstruction,
    place,
    paramPath,
    argumentResult.place,
    argumentResult.identifiers,
  );
  functionBuilder.header.push(instruction);
  return {
    place,
    identifiers: argumentResult.identifiers,
    paramBindings: argumentResult.identifiers,
  };
}
