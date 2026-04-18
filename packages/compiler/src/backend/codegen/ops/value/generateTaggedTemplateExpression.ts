import * as t from "@babel/types";
import { TaggedTemplateExpressionOp } from "../../../../ir/ops/call/TaggedTemplateExpression";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateTaggedTemplateExpressionOp(
  instruction: TaggedTemplateExpressionOp,
  generator: CodeGenerator,
): t.Expression {
  const tag = generator.values.get(instruction.tag.id);
  if (!tag) {
    throw new Error(`Value not found for tagged template tag: ${instruction.tag.id}`);
  }
  t.assertExpression(tag);

  const quasi = generator.values.get(instruction.quasi.id);
  if (!quasi) {
    throw new Error(`Value not found for tagged template quasi: ${instruction.quasi.id}`);
  }
  t.assertTemplateLiteral(quasi);

  const node = t.taggedTemplateExpression(tag, quasi);
  generator.values.set(instruction.place.id, node);
  return node;
}
