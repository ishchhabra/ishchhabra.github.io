import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../environment";
import {
  ArrayPatternInstruction,
  BindingIdentifierInstruction,
  HoleInstruction,
  LiteralInstruction,
  ObjectPropertyInstruction,
  Place,
  RestElementInstruction,
} from "../../ir";
import { AssignmentPatternInstruction } from "../../ir/instructions/pattern/AssignmentPattern";
import { ObjectPatternInstruction } from "../../ir/instructions/pattern/ObjectPattern";
import { isContextVariable } from "./bindings/isContextVariable";
import { buildNode } from "./buildNode";
import { getValueFromStaticKey } from "./getValueFromStaticKey";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

/**
 * One formal parameter after lowering: the param root `place` and the root
 * header instruction `paramBindings` (empty for a simple identifier param).
 */
export interface BuiltFunctionParam {
  place: Place;
  paramBindings: Place[];
}

/** Internal result while lowering params (includes recursive `identifiers`). */
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
  return paramPaths.map((paramPath: NodePath<t.Identifier | t.RestElement | t.Pattern>) => {
    const r = buildFunctionParam(
      paramPath as NodePath<t.LVal>,
      bodyPath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
    return { place: r.place, paramBindings: r.paramBindings };
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
    return buildFunctionIdentifierParam(paramPath, bodyPath, functionBuilder, environment);
  } else if (paramPath.isArrayPattern()) {
    return buildFunctionArrayPatternParam(
      paramPath,
      bodyPath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  } else if (paramPath.isObjectPattern()) {
    return buildFunctionObjectPatternParam(
      paramPath,
      bodyPath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  } else if (paramPath.isAssignmentPattern()) {
    return buildFunctionAssignmentPatternParam(
      paramPath,
      bodyPath,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  } else if (paramPath.isRestElement()) {
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
  bodyPath: NodePath,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): ParamBuildResult {
  const name = paramPath.node.name;
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(BindingIdentifierInstruction, place, paramPath);
  functionBuilder.header.push(instruction);

  const declarationId = identifier.declarationId;

  // Mark context variables before renaming so SSA can skip them.
  const binding = bodyPath.scope.getBinding(name);
  if (binding && isContextVariable(binding, bodyPath)) {
    environment.contextDeclarationIds.add(declarationId);
  }

  functionBuilder.registerDeclarationName(name, declarationId, bodyPath);
  bodyPath.scope.rename(name, identifier.name);
  functionBuilder.registerDeclarationName(identifier.name, declarationId, bodyPath);
  environment.registerDeclaration(declarationId, functionBuilder.currentBlock.id, place.id);
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
    // Holes in array patterns (e.g. `function([,b]){}`) — emit a HoleInstruction.
    if (!elementPath.hasNode()) {
      const holeIdentifier = environment.createIdentifier();
      const holePlace = environment.createPlace(holeIdentifier);
      const instruction = environment.createInstruction(
        HoleInstruction,
        holePlace,
        elementPath as NodePath<null>,
      );
      functionBuilder.header.push(instruction);
      return holePlace;
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
        // Computed keys — emit via buildNode, then splice into header.
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
  // Non-computed parameter destructuring keys are property labels (identifiers,
  // string literals, or numeric literals), not variable references.
  // Emit a LiteralInstruction so the key survives SSA transformations
  // (clone/rewrite) unchanged.
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
  const leftPath = paramPath.get("left");
  const leftResult = buildFunctionParam(
    leftPath as NodePath<t.LVal>,
    bodyPath,
    functionBuilder,
    moduleBuilder,
    environment,
  );

  // buildNode emits instructions into the current block, but param
  // instructions must live in the function header for codegen to resolve
  // places during param generation. We splice the newly added instructions
  // from the block into the header.
  const insertPoint = functionBuilder.currentBlock.instructions.length;
  const rightPath = paramPath.get("right");
  const rightPlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Default value must be a single expression");
  }
  const defaultValueInstructions = functionBuilder.currentBlock.instructions.splice(insertPoint);
  functionBuilder.header.push(...defaultValueInstructions);

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
