import type { Function } from "oxc-parser";
import { Environment } from "../../../environment";
import { FunctionExpressionOp } from "../../../ir/ops/func/FunctionExpression";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildFunctionExpression(
  node: Function,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const name = node.id != null ? node.id.name : null;
  if (node.body == null) {
    throw new Error("Function expressions must have a body");
  }

  const childScope = functionBuilder.scopeFor(node);
  const funcOpBuilder = new FuncOpBuilder(
    node.params,
    node.body,
    childScope,
    functionBuilder.scopeMap,
    functionBuilder.environment,
    moduleBuilder,
    node.async ?? false,
    node.generator ?? false,
    functionBuilder.funcOpId,
  );
  const funcOp = funcOpBuilder.build();

  functionBuilder.propagateCapturesFrom(funcOpBuilder);

  const capturedPlaces = [...funcOpBuilder.captures.values()];
  const place = environment.createValue();
  const instruction = environment.createOperation(
    FunctionExpressionOp,
    place,
    name,
    funcOp,
    node.generator ?? false,
    node.async ?? false,
    capturedPlaces,
  );
  functionBuilder.addOp(instruction);
  return place;
}
