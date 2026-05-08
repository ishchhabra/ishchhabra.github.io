import type { MetaProperty } from "oxc-parser";
import type { Value } from "../../ir/core/Value";
import { MetaPropertyOp, type MetaPropertyKind } from "../../ir/ops/functions/MetaPropertyOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";

/**
 * Lowers an ECMAScript meta property.
 */
export function lowerMetaProperty(builder: FunctionIRBuilder, expression: MetaProperty): Value {
  const result = builder.createValue();

  builder.emit(new MetaPropertyOp(builder.operationId(), metaPropertyKind(expression), result));

  return result;
}

function metaPropertyKind(expression: MetaProperty): MetaPropertyKind {
  const meta = expression.meta.name;
  const property = expression.property.name;

  if (meta === "import" && property === "meta") {
    return { meta, property };
  }

  if (meta === "new" && property === "target") {
    return { meta, property };
  }

  throw new Error(`Unsupported meta property: ${meta}.${property}`);
}
