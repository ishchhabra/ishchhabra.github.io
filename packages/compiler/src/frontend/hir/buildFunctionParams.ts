import type { Expression, Node, PrivateIdentifier } from "oxc-parser";
import { Environment } from "../../environment";
import { type DestructureObjectProperty, type DestructureTarget, Place } from "../../ir";
import type * as AST from "../estree";
import { type Scope } from "../scope/Scope";
import { instantiateFunctionParamBindings } from "./bindings/instantiateFunctionParamBindings";
import { buildNode } from "./buildNode";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { getValueFromStaticKey } from "./getValueFromStaticKey";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

export interface BuiltFunctionParam {
  place: Place;
  target: DestructureTarget;
  paramBindings: Place[];
}

/**
 * One formal parameter after lowering: the runtime param root `place`, the
 * source-level param `target`, and the leaf bindings defined by the param.
 */
interface ParamBuildResult {
  place: Place;
  target: DestructureTarget;
  paramBindings: Place[];
}

export function buildFunctionParams(
  params: AST.Pattern[],
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): BuiltFunctionParam[] {
  instantiateFunctionParamBindings(params, scope, functionBuilder, environment);

  return params.map((param) => {
    const result = buildFunctionParam(param, scope, functionBuilder, moduleBuilder, environment);
    return { place: result.place, target: result.target, paramBindings: result.paramBindings };
  });
}

function buildFunctionParam(
  param: AST.Pattern,
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
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (param.type === "ObjectPattern") {
    return buildFunctionObjectPatternParam(
      param,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (param.type === "AssignmentPattern") {
    return buildFunctionAssignmentPatternParam(
      param,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (param.type === "RestElement") {
    return buildFunctionRestElementParam(param, scope, functionBuilder, moduleBuilder, environment);
  }

  throw new Error(`Unsupported param type: ${(param as Node).type}`);
}

function buildFunctionIdentifierParam(
  node: AST.Identifier,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): ParamBuildResult {
  const place = buildFunctionIdentifierParamPlace(node, scope, functionBuilder, environment);
  const declarationId = place.identifier.declarationId;
  functionBuilder.markDeclarationInitialized(declarationId);
  return {
    place,
    target: {
      kind: "binding",
      place,
      storage: environment.contextDeclarationIds.has(declarationId) ? "context" : "local",
    },
    paramBindings: [place],
  };
}

function buildFunctionArrayPatternParam(
  node: AST.ArrayPattern,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): ParamBuildResult {
  const paramPlace = environment.createPlace(environment.createIdentifier());
  const paramBindings: Place[] = [];
  const elements = node.elements.map((element) => {
    // Holes in array patterns (e.g. `function([,b]){}`) are structural markers
    // in the pattern shape, not values in the data-flow graph.
    if (element == null) {
      return null;
    }

    const result = buildFunctionParam(element, scope, functionBuilder, moduleBuilder, environment);
    paramBindings.push(...result.paramBindings);
    return result.target;
  });
  return {
    place: paramPlace,
    target: { kind: "array", elements },
    paramBindings,
  };
}

function buildFunctionObjectPatternParam(
  node: AST.ObjectPattern,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): ParamBuildResult {
  const place = environment.createPlace(environment.createIdentifier());
  const paramBindings: Place[] = [];
  const properties: DestructureObjectProperty[] = node.properties.map((property) => {
    if (property.type === "Property") {
      let key: string | number | Place;
      if (property.computed) {
        // Computed keys emit normal value instructions; move them into the
        // function header so param codegen can resolve them during emission.
        const insertPoint = functionBuilder.currentBlock.instructions.length;
        const p = buildNode(property.key, scope, functionBuilder, moduleBuilder, environment);
        if (p === undefined || Array.isArray(p)) {
          throw new Error("Object pattern computed key must be a single place");
        }
        const keyInstructions = functionBuilder.currentBlock.instructions.splice(insertPoint);
        functionBuilder.addHeaderInstructions(keyInstructions);
        key = p;
      } else {
        key = buildFunctionObjectPropertyKey(property.key);
      }

      const value = property.value as AST.Pattern;
      const valueResult = buildFunctionParam(
        value,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      paramBindings.push(...valueResult.paramBindings);
      return {
        key,
        computed: property.computed,
        shorthand: property.shorthand,
        value: valueResult.target,
      };
    }

    if (property.type === "RestElement") {
      const argumentResult = buildFunctionParam(
        property.argument,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      paramBindings.push(...argumentResult.paramBindings);
      return {
        key: "rest",
        computed: false,
        shorthand: false,
        value: {
          kind: "rest",
          argument: argumentResult.target,
        },
      };
    }

    throw new Error("Unsupported object pattern property");
  });
  return {
    place,
    target: { kind: "object", properties },
    paramBindings,
  };
}

function buildFunctionObjectPropertyKey(keyNode: Expression | PrivateIdentifier): string | number {
  // Non-computed parameter destructuring keys are property labels
  // (identifiers, strings, numbers), not variable references.
  const value = getValueFromStaticKey(keyNode);
  if (value === undefined) {
    throw new Error("Unsupported static key type in object pattern destructuring");
  }
  return value;
}

function buildFunctionAssignmentPatternParam(
  node: AST.AssignmentPattern,
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
  functionBuilder.addHeaderInstructions(defaultValueInstructions);

  const leftResult = buildFunctionParam(
    node.left,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );
  return {
    place: environment.createPlace(environment.createIdentifier()),
    target: {
      kind: "assignment",
      left: leftResult.target,
      right: rightPlace,
    },
    paramBindings: leftResult.paramBindings,
  };
}

function buildFunctionRestElementParam(
  node: AST.RestElement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): ParamBuildResult {
  const argumentResult = buildFunctionParam(
    node.argument,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );
  return {
    place: environment.createPlace(environment.createIdentifier()),
    target: {
      kind: "rest",
      argument: argumentResult.target,
    },
    paramBindings: argumentResult.paramBindings,
  };
}

function buildFunctionIdentifierParamPlace(
  node: AST.Identifier,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
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

  return place;
}
