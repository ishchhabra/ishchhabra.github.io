import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
import type { Environment } from "../../../environment";
import {
  effects,
  NoEffects,
  UnknownLocation,
  type MemoryEffects,
} from "../../memory/MemoryLocation";
export type UnaryOperator = "-" | "+" | "!" | "~" | "typeof" | "void" | "delete";

/**
 * Represents a unary expression.
 *
 * Example:
 * !a
 * delete a
 */
export class UnaryExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly operator: UnaryOperator,
    public readonly argument: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): UnaryExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(UnaryExpressionOp, place, this.operator, this.argument);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new UnaryExpressionOp(
      this.id,
      this.place,
      this.operator,
      values.get(this.argument) ?? this.argument,
    );
  }

  operands(): Value[] {
    return [this.argument];
  }

  // Five-axis effects: dispatch by operator.
  //
  // - `delete o.x` — writes a property slot. Treat as
  //   `writes=[UnknownLocation]` (we don't have the receiver value
  //   surfaced here) and `mayThrow=true` (strict-mode delete on
  //   non-configurable, Proxy `deleteProperty` trap).
  // - `typeof` — total; safe on undeclared identifiers.
  // - `-`, `+`, `!`, `~` — ToPrimitive on objects can call
  //   `valueOf`/`Symbol.toPrimitive`, which may throw; conservatively
  //   `mayThrow=true`.
  // - `void` — yields `undefined`; the operand is a separate op
  //   carrying its own effects. The void itself is all-clean.
  //
  // None diverge, all deterministic, none observable on their own.
  public override getMemoryEffects(): MemoryEffects {
    if (this.operator === "delete") return effects([], [UnknownLocation]);
    return NoEffects;
  }
  public override mayThrow(environment?: Environment): boolean {
    if (this.operator === "delete") return true;
    // `void E` propagates the operand's throw-ability so codegen
    // doesn't lose a `void f();` statement that had to be kept for
    // its operand's effects. Other unaries (`-`/`+`/`!`/`~`/`typeof`)
    // are treated as non-throwing — preserves the pre-five-axis
    // decision; tightening would need an operand-type analysis.
    if (this.operator === "void") {
      const argInstr = this.argument.def as Operation | undefined;
      return argInstr ? argInstr.mayThrow(environment) : false;
    }
    return false;
  }
  public override mayDiverge(environment?: Environment): boolean {
    if (this.operator === "void") {
      const argInstr = this.argument.def as Operation | undefined;
      return argInstr ? argInstr.mayDiverge(environment) : false;
    }
    return false;
  }
  public override get isDeterministic(): boolean {
    return true;
  }
  public override isObservable(environment?: Environment): boolean {
    // `void E` inherits its operand's observability so DCE doesn't
    // strip the `void` wrapper from a kept expression statement.
    if (this.operator === "void") {
      const argInstr = this.argument.def as Operation | undefined;
      return argInstr ? argInstr.isObservable(environment) : false;
    }
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = unary "${this.operator}" ${this.argument.print()}`;
  }
}
