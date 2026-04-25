import type { Expression, Node, PrivateIdentifier } from "oxc-parser";
import { Environment } from "../../environment";
import { type DestructureObjectProperty, type DestructureTarget, Operation, Value } from "../../ir";
import type { FunctionParam } from "../../ir/core/FuncOp";
import type * as AST from "../estree";
import { type Scope } from "../scope/Scope";
import { instantiateFunctionParamBindings } from "./bindings/instantiateFunctionParamBindings";
import { buildNode } from "./buildNode";
import { FuncOpBuilder } from "./FuncOpBuilder";
import { getValueFromStaticKey } from "./getValueFromStaticKey";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

type FunctionArgParam = Extract<FunctionParam, { kind: "arg" }>;

export function buildFunctionParams(
  params: AST.Pattern[],
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): FunctionArgParam[] {
  instantiateFunctionParamBindings(params, scope, functionBuilder, environment);

  return params.map((param) => {
    return buildFunctionParam(param, scope, functionBuilder, moduleBuilder, environment);
  });
}

function buildFunctionParam(
  param: AST.Pattern,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): FunctionArgParam {
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
  node: AST.Value,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): FunctionArgParam {
  const place = buildFunctionIdentifierParamPlace(node, scope, functionBuilder, environment);
  const declarationId = place.declarationId;
  functionBuilder.markDeclarationInitialized(declarationId);
  return {
    value: place,
    kind: "arg",
    source: {
      target: {
        kind: "binding",
        place,
        storage: environment.contextDeclarationIds.has(declarationId) ? "context" : "local",
      },
      ops: [],
    },
  };
}

function buildFunctionArrayPatternParam(
  node: AST.ArrayPattern,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): FunctionArgParam {
  const paramPlace = environment.createValue();
  const ops: Operation[] = [];
  const elements = node.elements.map((element) => {
    // Holes in array patterns (e.g. `function([,b]){}`) are structural markers
    // in the pattern shape, not values in the data-flow graph.
    if (element == null) {
      return null;
    }

    const result = buildFunctionParam(element, scope, functionBuilder, moduleBuilder, environment);
    ops.push(...result.source.ops);
    return result.source.target;
  });
  return {
    value: paramPlace,
    kind: "arg",
    source: {
      target: { kind: "array", elements },
      ops,
    },
  };
}

function buildFunctionObjectPatternParam(
  node: AST.ObjectPattern,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): FunctionArgParam {
  const place = environment.createValue();
  const ops: Operation[] = [];
  const properties: DestructureObjectProperty[] = node.properties.map((property) => {
    if (property.type === "Property") {
      let key: string | number | Value;
      if (property.computed) {
        // Computed keys emit normal value instructions; move them into the
        // function header so param codegen can resolve them during emission.
        const insertPoint = functionBuilder.currentBlock.operations.length;
        const p = buildNode(property.key, scope, functionBuilder, moduleBuilder, environment);
        if (p === undefined || Array.isArray(p)) {
          throw new Error("Object pattern computed key must be a single place");
        }
        const keyInstructions = functionBuilder.currentBlock.spliceInstructions(insertPoint);
        ops.push(...keyInstructions);
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
      ops.push(...valueResult.source.ops);
      return {
        key,
        computed: property.computed,
        shorthand: property.shorthand,
        value: valueResult.source.target,
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
      ops.push(...argumentResult.source.ops);
      return {
        key: "rest",
        computed: false,
        shorthand: false,
        value: {
          kind: "rest",
          argument: argumentResult.source.target,
        },
      };
    }

    throw new Error("Unsupported object pattern property");
  });
  return {
    value: place,
    kind: "arg",
    source: {
      target: { kind: "object", properties },
      ops,
    },
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
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): FunctionArgParam {
  // buildNode emits instructions into the current block, but parameter default
  // value instructions must live in the function header for codegen.
  const insertPoint = functionBuilder.currentBlock.operations.length;
  const rightPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Default value must be a single expression");
  }
  const defaultValueInstructions = functionBuilder.currentBlock.spliceInstructions(insertPoint);

  const leftResult = buildFunctionParam(
    node.left,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );
  return {
    value: environment.createValue(),
    kind: "arg",
    source: {
      target: {
        kind: "assignment",
        left: leftResult.source.target,
        right: rightPlace,
      },
      ops: [...defaultValueInstructions, ...leftResult.source.ops],
    },
  };
}

function buildFunctionRestElementParam(
  node: AST.RestElement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): FunctionArgParam {
  const argumentResult = buildFunctionParam(
    node.argument,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );
  return {
    value: environment.createValue(),
    kind: "arg",
    source: {
      target: {
        kind: "rest",
        argument: argumentResult.source.target,
      },
      ops: argumentResult.source.ops,
    },
  };
}

function buildFunctionIdentifierParamPlace(
  node: AST.Value,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Value {
  const name = node.name;
  const declarationId = functionBuilder.getDeclarationId(name, scope);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${name}`);
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId);
  const place = latestDeclaration.value;
  if (place === undefined) {
    throw new Error(`Unable to find the place for ${name} (${declarationId})`);
  }

  return place;
}
