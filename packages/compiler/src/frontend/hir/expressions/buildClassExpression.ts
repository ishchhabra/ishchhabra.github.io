import type { Class } from "oxc-parser";
import { Environment } from "../../../environment";
import { ClassExpressionOp, Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildClassBody } from "../buildClassElements";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildClassExpression(
  node: Class,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  if (node.decorators && node.decorators.length > 0) {
    throw new Error("Unsupported: class decorators");
  }

  const classScope = functionBuilder.scopeFor(node);

  let identifierPlace: Place | null = null;
  if (node.id != null) {
    const built = buildNode(node.id, classScope, functionBuilder, moduleBuilder, environment);
    if (built === undefined || Array.isArray(built)) {
      throw new Error("Class expression identifier must be a single place");
    }
    identifierPlace = built;
  }

  let superClassPlace: Place | null = null;
  if (node.superClass != null) {
    const built = buildNode(node.superClass, scope, functionBuilder, moduleBuilder, environment);
    if (built === undefined || Array.isArray(built)) {
      throw new Error("Class superClass must be a single place");
    }
    superClassPlace = built;
  }

  const elements = buildClassBody(
    node.body.body,
    classScope,
    functionBuilder,
    moduleBuilder,
    environment,
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(
    ClassExpressionOp,
    place,
    identifierPlace,
    superClassPlace,
    elements,
  );
  functionBuilder.addOp(instruction);

  return place;
}
