import type { TaggedTemplateExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { TaggedTemplateExpressionOp } from "../../../ir/ops/call/TaggedTemplateExpression";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildTaggedTemplateExpression(
  node: TaggedTemplateExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const tagPlace = buildNode(node.tag, scope, functionBuilder, moduleBuilder, environment);
  if (tagPlace === undefined || Array.isArray(tagPlace)) {
    throw new Error("Tagged template tag must be a single place");
  }

  const quasiPlace = buildNode(node.quasi, scope, functionBuilder, moduleBuilder, environment);
  if (quasiPlace === undefined || Array.isArray(quasiPlace)) {
    throw new Error("Tagged template quasi must be a single place");
  }

  const place = environment.createValue();
  const instruction = environment.createOperation(
    TaggedTemplateExpressionOp,
    place,
    tagPlace,
    quasiPlace,
  );
  functionBuilder.addOp(instruction);
  return place;
}
