import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { TaggedTemplateExpressionInstruction } from "../../../ir/instructions/value/TaggedTemplateExpression";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildTaggedTemplateExpression(
  node: ESTree.TaggedTemplateExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
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

  const identifier = environment.createIdentifier(undefined, scope.allocateName());
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    TaggedTemplateExpressionInstruction,
    place,
    tagPlace,
    quasiPlace,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
