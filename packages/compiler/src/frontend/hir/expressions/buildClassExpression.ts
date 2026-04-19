import type { Class } from "oxc-parser";
import { Environment } from "../../../environment";
import { ClassExpressionOp, Value } from "../../../ir";
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

  const name = node.id != null ? node.id.name : null;

  let superClassPlace: Value | null = null;
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

  const place = environment.createValue();
  const instruction = environment.createOperation(
    ClassExpressionOp,
    place,
    name,
    superClassPlace,
    elements,
  );
  functionBuilder.addOp(instruction);

  return place;
}
