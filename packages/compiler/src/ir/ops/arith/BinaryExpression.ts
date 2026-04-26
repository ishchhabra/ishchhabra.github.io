import { OperationId, Value } from "../../core";
import type { CloneContext } from "../../core/Operation";
import { Operation } from "../../core/Operation";

export type BinaryOperator =
  | "=="
  | "!="
  | "==="
  | "!=="
  | "<"
  | "<="
  | ">"
  | ">="
  | "<<"
  | ">>"
  | ">>>"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "**"
  | "|"
  | "^"
  | "&"
  | "in"
  | "instanceof";

/**
 * Represents a binary expression.
 *
 * Example:
 * 1 + 2
 */
export class BinaryExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly operator: BinaryOperator,
    public readonly left: Value,
    public readonly right: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): BinaryExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(BinaryExpressionOp, place, this.operator, this.left, this.right);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new BinaryExpressionOp(
      this.id,
      this.place,
      this.operator,
      values.get(this.left) ?? this.left,
      values.get(this.right) ?? this.right,
    );
  }

  operands(): Value[] {
    return [this.left, this.right];
  }

  // Five-axis effects:
  //  - No memory reads/writes (operands are separate ops).
  //  - mayThrow: in principle `+`/`-`/`*`/`<`/`instanceof`/`in` can
  //    trigger ToPrimitive on objects (which calls
  //    `valueOf`/`Symbol.toPrimitive` — a getter that may throw)
  //    and `instanceof`/`in` throw on non-object RHS. The existing
  //    optimizer treats binary ops as non-throwing; we preserve
  //    that decision per-axis. A tighter answer would need an
  //    operand-type analysis we don't run yet.
  //  - mayDiverge=false. isDeterministic=true. isObservable=false.
  public override mayThrow(): boolean {
    return false;
  }
  public override mayDiverge(): boolean {
    return false;
  }
  public override get isDeterministic(): boolean {
    return true;
  }
  public override isObservable(): boolean {
    return false;
  }
  public override getMemoryEffects(): import("../../memory/MemoryLocation").MemoryEffects {
    return { reads: [], writes: [] };
  }

  public override print(): string {
    return `${this.place.print()} = binary "${this.operator}" ${this.left.print()}, ${this.right.print()}`;
  }
}
