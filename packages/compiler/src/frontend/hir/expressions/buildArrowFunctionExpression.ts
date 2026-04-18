import type { ArrowFunctionExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { Value } from "../../../ir";
import { ArrowFunctionExpressionOp } from "../../../ir/ops/func/ArrowFunctionExpression";
import { isExpression, unwrapTSTypeWrappers } from "../../estree";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildArrowFunctionExpression(
  node: ArrowFunctionExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const body = node.body;
  const conciseExpressionBody = isExpression(unwrapTSTypeWrappers(body));
  const childScope = functionBuilder.scopeFor(node);
  const funcOpBuilder = new FuncOpBuilder(
    node.params,
    body,
    childScope,
    functionBuilder.scopeMap,
    functionBuilder.environment,
    moduleBuilder,
    node.async ?? false,
    false,
    functionBuilder.funcOpId,
  );
  const funcOp = funcOpBuilder.build();

  functionBuilder.propagateCapturesFrom(funcOpBuilder);

  const capturedPlaces = [...funcOpBuilder.captures.values()];
  const place = environment.createValue();
  const instruction = environment.createOperation(
    ArrowFunctionExpressionOp,
    place,
    funcOp,
    node.async ?? false,
    conciseExpressionBody,
    false,
    capturedPlaces,
  );
  functionBuilder.addOp(instruction);
  return place;
}
