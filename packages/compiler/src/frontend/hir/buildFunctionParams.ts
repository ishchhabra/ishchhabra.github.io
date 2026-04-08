import type * as AST from "../estree";
import { Environment } from "../../environment";
import {
  ArrayPatternInstruction,
  DeclareLocalInstruction,
  LiteralInstruction,
  ObjectPropertyInstruction,
  Place,
  RestElementInstruction,
} from "../../ir";
import { AssignmentPatternInstruction } from "../../ir/instructions/pattern/AssignmentPattern";
import { ObjectPatternInstruction } from "../../ir/instructions/pattern/ObjectPattern";
import { type Scope } from "../scope/Scope";
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
  params: AST.Pattern[],
  scopeNode: AST.Node,
  bodyNode: AST.Node,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): BuiltFunctionParam[] {
  instantiateFunctionParamBindings(params, scope, functionBuilder, environment);

  return params.map((param) => {
    const result = buildFunctionParam(
      param,
      bodyNode,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
    return { place: result.place, paramBindings: result.paramBindings };
  });
}

function buildFunctionParam(
  param: AST.Pattern,
  bodyNode: AST.Node,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): ParamBuildResult {
  if (param.type === "Identifier") {
    return buildFunctionIdentifierParam(param, scope, functionBuilder, environment);
  }
  if (param.type === "ArrayPattern") {
    return buildFunctionArrayPatternParam(
      param,
      bodyNode,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (param.type === "ObjectPattern") {
    return buildFunctionObjectPatternParam(
      param,
      bodyNode,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (param.type === "AssignmentPattern") {
    return buildFunctionAssignmentPatternParam(
      param,
      bodyNode,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (param.type === "RestElement") {
    return buildFunctionRestElementParam(
      param,
      bodyNode,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  throw new Error(`Unsupported param type: ${(param as AST.Node).type}`);
}

function buildFunctionIdentifierParam(
  node: AST.Identifier,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): ParamBuildResult {
  const name = node.name;
  const declarationId = functionBuilder.getDeclarationId(name, scope);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${name}`);
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId);
  const place = environment.places.get(latestDeclaration.placeId);
  if (place === undefined) {
    throw new Error(`Unable to find the place for ${name} (${declarationId})`);
  }

  functionBuilder.markDeclarationInitialized(declarationId);

  const declareInstr = environment.createInstruction(DeclareLocalInstruction, place, "const");
  functionBuilder.header.push(declareInstr);

  return { place, identifiers: [place], paramBindings: [] };
}

function buildFunctionArrayPatternParam(
  node: AST.ArrayPattern,
  bodyNode: AST.Node,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): ParamBuildResult {
  const identifiers: Place[] = [];
  const places = node.elements.map((element) => {
    // Holes in array patterns (e.g. `function([,b]){}`) are structural markers
    // in the pattern shape, not values in the data-flow graph.
    if (element == null) {
      return null;
    }

    const result = buildFunctionParam(
      element,
      bodyNode,
      scope,
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
    places,
    identifiers,
  );
  functionBuilder.header.push(instruction);
  return { place, identifiers, paramBindings: identifiers };
}

function buildFunctionObjectPatternParam(
  node: AST.ObjectPattern,
  bodyNode: AST.Node,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): ParamBuildResult {
  const identifiers: Place[] = [];
  const propertyPlaces = node.properties.map((property) => {
    if (property.type === "Property") {
      let keyPlace: Place;
      if (property.computed) {
        // Computed keys emit normal value instructions; move them into the
        // function header so param codegen can resolve them during emission.
        const insertPoint = functionBuilder.currentBlock.instructions.length;
        const p = buildNode(property.key, scope, functionBuilder, moduleBuilder, environment);
        if (p === undefined || Array.isArray(p)) {
          throw new Error("Object pattern computed key must be a single place");
        }
        const keyInstructions = functionBuilder.currentBlock.instructions.splice(insertPoint);
        functionBuilder.header.push(...keyInstructions);
        keyPlace = p;
      } else {
        keyPlace = buildFunctionObjectPropertyKey(property.key, functionBuilder, environment);
      }

      const value = property.value as AST.Pattern;
      const valueResult = buildFunctionParam(
        value,
        bodyNode,
        scope,
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
        keyPlace,
        valueResult.place,
        property.computed,
        property.shorthand,
        valueResult.identifiers,
      );
      functionBuilder.header.push(instruction);
      return place;
    }

    if (property.type === "RestElement") {
      const argumentResult = buildFunctionParam(
        property.argument,
        bodyNode,
        scope,
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
    propertyPlaces,
    identifiers,
  );
  functionBuilder.header.push(instruction);
  return { place, identifiers, paramBindings: identifiers };
}

function buildFunctionObjectPropertyKey(
  keyNode: AST.Expression | AST.PrivateIdentifier,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  // Non-computed parameter destructuring keys are property labels
  // (identifiers, strings, numbers), not variable references.
  const value = getValueFromStaticKey(keyNode);
  if (value === undefined) {
    throw new Error("Unsupported static key type in object pattern destructuring");
  }
  const keyIdentifier = environment.createIdentifier();
  const keyPlace = environment.createPlace(keyIdentifier);
  const keyInstruction = environment.createInstruction(LiteralInstruction, keyPlace, value);
  functionBuilder.header.push(keyInstruction);
  return keyPlace;
}

function buildFunctionAssignmentPatternParam(
  node: AST.AssignmentPattern,
  bodyNode: AST.Node,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): ParamBuildResult {
  // buildNode emits instructions into the current block, but parameter default
  // value instructions must live in the function header for codegen.
  const insertPoint = functionBuilder.currentBlock.instructions.length;
  const rightPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Default value must be a single expression");
  }
  const defaultValueInstructions = functionBuilder.currentBlock.instructions.splice(insertPoint);
  functionBuilder.header.push(...defaultValueInstructions);

  const leftResult = buildFunctionParam(
    node.left,
    bodyNode,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    AssignmentPatternInstruction,
    place,
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
  node: AST.RestElement,
  bodyNode: AST.Node,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): ParamBuildResult {
  const argumentResult = buildFunctionParam(
    node.argument,
    bodyNode,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    RestElementInstruction,
    place,
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
