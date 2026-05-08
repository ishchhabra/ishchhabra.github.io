import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, PureOperationEffects } from "../../effects";

export type MetaPropertyKind =
  | {
      readonly meta: "import";
      readonly property: "meta";
    }
  | {
      readonly meta: "new";
      readonly property: "target";
    };

/**
 * Materializes an ECMAScript meta property.
 *
 * Meta properties are syntax-level runtime values. They are not property reads:
 * `import.meta` and `new.target` have dedicated ECMAScript semantics.
 *
 * @example
 * ```js
 * import.meta;
 * new.target;
 * ```
 */
export class MetaPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public readonly kind: MetaPropertyKind,
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return [];
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override clone(context: OperationCloneContext): MetaPropertyOp {
    return new MetaPropertyOp(context.ids.operationId(), this.kind, context.value(this.result));
  }
}
