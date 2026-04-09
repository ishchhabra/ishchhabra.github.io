import type { Class } from "oxc-parser";
import { Environment } from "../../../environment";
import { ClassExpressionInstruction, Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildClassBody } from "../buildClassElements";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildClassExpression(
  node: Class,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  if (node.decorators && node.decorators.length > 0) {
    throw new Error("Unsupported: class decorators");
  }

  const classScope = functionBuilder.scopeFor(node);
  const innerScope = node.id != null ? classScope : scope;

  let identifierPlace: Place | null = null;
  if (node.id != null) {
    const built = buildNode(node.id, innerScope, functionBuilder, moduleBuilder, environment);
    if (built === undefined || Array.isArray(built)) {
      throw new Error("Class expression identifier must be a single place");
    }
    identifierPlace = built;
  }

  let superClassPlace: Place | null = null;
  if (node.superClass != null) {
    const built = buildNode(
      node.superClass,
      innerScope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
    if (built === undefined || Array.isArray(built)) {
      throw new Error("Class superClass must be a single place");
    }
    superClassPlace = built;
  }

  const { elements, staticFieldEmitters } = buildClassBody(
    node.body.body,
    node.superClass != null,
    innerScope,
    functionBuilder,
    moduleBuilder,
    environment,
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ClassExpressionInstruction,
    place,
    identifierPlace,
    superClassPlace,
    elements,
  );
  functionBuilder.addInstruction(instruction);

  // Emit static field stores after the class instruction.
  for (const emit of staticFieldEmitters) {
    emit(place);
  }

  return place;
}
