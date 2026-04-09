import type { ClassElement, Expression, PropertyDefinition } from "oxc-parser";
import { Environment } from "../../environment";
import { ClassPropertyInstruction, LiteralInstruction, Place } from "../../ir";
import type { Scope } from "../scope/Scope";
import { buildClassMethod } from "./buildClassMethod";
import { buildNode } from "./buildNode";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

/**
 * Builds the elements of a class body as first-class IR nodes.
 *
 * Methods become {@link ClassMethodInstruction}s and fields become
 * {@link ClassPropertyInstruction}s. Nothing is desugared — see the
 * comment on {@link ClassPropertyInstruction} for the spec-correctness
 * rationale (define-vs-set semantics, per-instance evaluation,
 * derived-constructor ordering, etc.).
 */
export function buildClassBody(
  elements: ClassElement[],
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place[] {
  const result: Place[] = [];

  for (const element of elements) {
    switch (element.type) {
      case "MethodDefinition": {
        result.push(buildClassMethod(element, scope, functionBuilder, moduleBuilder, environment));
        break;
      }
      case "PropertyDefinition": {
        result.push(
          buildClassProperty(element, scope, functionBuilder, moduleBuilder, environment),
        );
        break;
      }
      case "StaticBlock":
        throw new Error("Unsupported: static blocks");
      case "AccessorProperty":
        throw new Error("Unsupported: accessor properties");
      default:
        throw new Error(`Unsupported class element type: ${(element as { type: string }).type}`);
    }
  }

  return result;
}

function buildClassProperty(
  node: PropertyDefinition,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  if (node.decorators && node.decorators.length > 0) {
    throw new Error("Unsupported: class field decorators");
  }
  if (node.key.type === "PrivateIdentifier") {
    throw new Error("Unsupported: private class fields");
  }

  // Build the key. Non-computed identifier keys are property labels
  // (string literals), not variable references — same convention as
  // class methods and object properties.
  let keyPlace: Place;
  if (!node.computed && node.key.type === "Identifier") {
    const keyIdentifier = environment.createIdentifier();
    keyPlace = environment.createPlace(keyIdentifier);
    functionBuilder.addInstruction(
      environment.createInstruction(LiteralInstruction, keyPlace, node.key.name),
    );
  } else {
    const built = buildNode(node.key, scope, functionBuilder, moduleBuilder, environment);
    if (built === undefined || Array.isArray(built)) {
      throw new Error("Class field key must be a single place");
    }
    keyPlace = built;
  }

  // Build the initializer as a zero-arg FunctionIR "thunk" whose body is
  // the initializer expression. This matches the spec's model — each
  // initializer is conceptually a function closed over the class body
  // scope, invoked per-instance with `this` bound to the new instance —
  // and lets existing capture-analysis machinery work unchanged.
  //
  // At codegen time the thunk's single return expression is extracted
  // and planted as the value of the emitted `t.classProperty` node,
  // preserving spec-correct per-instance evaluation semantics.
  let valueIR: ReturnType<FunctionIRBuilder["build"]> | null = null;
  let capturedPlaces: Place[] = [];
  if (node.value != null) {
    const initBuilder = new FunctionIRBuilder(
      [],
      node.value as Expression,
      scope,
      functionBuilder.scopeMap,
      environment,
      moduleBuilder,
      false,
      false,
    );
    valueIR = initBuilder.build();
    functionBuilder.propagateCapturesFrom(initBuilder);
    capturedPlaces = [...initBuilder.captures.values()];
  }

  const fieldPlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(
      ClassPropertyInstruction,
      fieldPlace,
      keyPlace,
      valueIR,
      node.computed,
      node.static,
      capturedPlaces,
    ),
  );
  return fieldPlace;
}
