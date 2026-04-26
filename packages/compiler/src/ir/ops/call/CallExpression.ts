import type { Environment } from "../../../environment";
import { OperationId } from "../../core";
import { Value } from "../../core";
import {
  lookupBuiltin,
  type BuiltinEffects,
  type BuiltinRegion,
  type BuiltinSpec,
} from "../../builtins";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
import {
  computedPropertyLocation,
  effects,
  UnknownLocation,
  type MemoryEffects,
  type MemoryLocation,
} from "../../memory/MemoryLocation";
import { getQualifiedName } from "../../../pipeline/passes/resolveConstant";
/**
 * Represents a call expression.
 *
 * Example:
 * foo(1, 2)
 */
export class CallExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly callee: Value,
    // Using args instead of arguments since arguments is a reserved word
    public readonly args: Value[],
    public readonly optional: boolean = false,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): CallExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(CallExpressionOp, place, this.callee, this.args, this.optional);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new CallExpressionOp(
      this.id,
      this.place,
      values.get(this.callee) ?? this.callee,
      this.args.map((arg) => values.get(arg) ?? arg),
      this.optional,
    );
  }

  operands(): Value[] {
    return [this.callee, ...this.args];
  }

  /**
   * Resolve this call's callee to a builtin effect record, or
   * `undefined` if the callee can't be statically identified or
   * isn't in the builtin table. Treated as opaque (full-pessimism)
   * by all axis getters.
   */
  private resolveBuiltin(environment?: Environment): BuiltinSpec | undefined {
    if (environment === undefined) return undefined;
    const calleeOp = this.callee.def as Operation | undefined;
    if (calleeOp === undefined) return undefined;
    const qualified = getQualifiedName(calleeOp, environment);
    if (qualified === undefined) return undefined;
    return lookupBuiltin(qualified);
  }

  /**
   * Lower a {@link BuiltinRegion} to concrete {@link MemoryLocation}s.
   * `"args"` expands to a `computedProperty` location per arg (the
   * coarsest correct approximation: the call may touch any field of
   * any arg). `"none"` returns empty. `"unknown"` returns
   * `UnknownLocation` (full barrier).
   */
  private lowerRegion(region: BuiltinRegion): MemoryLocation[] {
    switch (region) {
      case "none":
        return [];
      case "args":
        return this.args.map((arg) => computedPropertyLocation(arg));
      case "unknown":
        return [UnknownLocation];
    }
  }

  /**
   * Five-axis effects. When the callee resolves to a builtin spec,
   * read each axis from the spec's {@link BuiltinEffects} record;
   * unknown / dynamic / imported callees are treated opaquely (full
   * pessimism on every axis).
   *
   * The opaque case must remain pessimistic: an opaque callee can
   * read/write arbitrary memory, throw, hang, return non-determinism,
   * and emit observable output. This is the alias barrier passes
   * rely on.
   */
  public override getMemoryEffects(environment?: Environment): MemoryEffects {
    const spec = this.resolveBuiltin(environment);
    if (spec === undefined) return effects([UnknownLocation], [UnknownLocation]);
    const e: BuiltinEffects = spec.effects;
    return effects(this.lowerRegion(e.reads), this.lowerRegion(e.writes));
  }
  public override mayThrow(environment?: Environment): boolean {
    const spec = this.resolveBuiltin(environment);
    return spec === undefined ? true : spec.effects.mayThrow;
  }
  public override mayDiverge(environment?: Environment): boolean {
    const spec = this.resolveBuiltin(environment);
    return spec === undefined ? true : spec.effects.mayDiverge;
  }
  public override get isDeterministic(): boolean {
    // Determinism doesn't depend on Environment; CallExpression
    // can't resolve a callee without one, so default to the
    // pessimistic answer. Passes that need precision should call
    // `lookupBuiltin(...)` themselves with an Environment in hand.
    return false;
  }
  public override isObservable(environment?: Environment): boolean {
    const spec = this.resolveBuiltin(environment);
    return spec === undefined ? true : spec.effects.isObservable;
  }

  public override print(): string {
    const args = this.args.map((a) => a.print()).join(", ");
    const attrs = this.optional ? " {optional}" : "";
    return `${this.place.print()} = call ${this.callee.print()}(${args})${attrs}`;
  }
}
