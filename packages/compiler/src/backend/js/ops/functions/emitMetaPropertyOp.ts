import type { MetaPropertyOp } from "../../../../ir/ops/functions/MetaPropertyOp";
import { identifier, metaProperty, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitMetaPropertyOp(context: CodegenContext, op: MetaPropertyOp): ESTreeStatement[] {
  context.values.set(
    op.result,
    metaProperty(identifier(op.kind.meta), identifier(op.kind.property)),
  );

  return [];
}
