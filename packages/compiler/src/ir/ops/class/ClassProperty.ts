import { OperationId } from "../../core";
import { Value } from "../../core";
import { FuncOp } from "../../core/FuncOp";

import { Operation } from "../../core/Operation";
import { makeCloneContext, requireModuleIR, type CloneContext } from "../../core/Operation";
/**
 * Represents a class field (a.k.a. public class property).
 *
 * Examples:
 * - `class C { x = 1; }`          // instance field
 * - `class C { static x = 1; }`   // static field
 * - `class C { x; }`              // uninitialized field (value === null)
 *
 * Unlike older loose-mode transforms, this is NOT desugared into
 * `this.x = 1` stores in the constructor. The spec (ECMA-262
 * InitializeInstanceElements / DefineField) defines fields with
 * `CreateDataPropertyOrThrow` (i.e. `[[DefineOwnProperty]]`), *not*
 * `[[Set]]`, and initializers evaluate per-instance at construction
 * time (interleaved correctly with `super()` for derived classes).
 * Keeping fields as first-class IR nodes lets codegen emit the original
 * class-field syntax and delegates those semantics to the JS runtime.
 *
 * The initializer is stored as its own {@link FuncOp} "thunk" so
 * that capture analysis and per-instance evaluation work naturally.
 * Codegen extracts the thunk's single return expression and plants it
 * into the emitted `t.classProperty` node. For an uninitialized field
 * (`x;`), the value is `null`.
 *
 * Non-computed identifier keys are stored as a {@link Value} referencing
 * a {@link LiteralOp}, matching the convention in
 * {@link ClassMethodOp} and {@link ObjectPropertyOp}.
 */
export class ClassPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly key: Value,
    public readonly value: FuncOp | null,
    public readonly computed: boolean,
    public readonly isStatic: boolean,
    public readonly captures: Value[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ClassPropertyOp {
    const moduleIR = requireModuleIR(ctx);
    const env = moduleIR.environment;
    const place = env.createValue();
    return env.createOperation(
      ClassPropertyOp,
      place,
      this.key,
      this.value === null ? null : this.value.clone(makeCloneContext(moduleIR)),
      this.computed,
      this.isStatic,
      this.captures,
    );
  }

  rewrite(values: Map<Value, Value>): Operation {
    const newKey = values.get(this.key) ?? this.key;
    const newCaptures = this.captures.map((c) => c.rewrite(values));
    const capturesChanged = newCaptures.some((c, i) => c !== this.captures[i]);
    if (newKey === this.key && !capturesChanged) {
      return this;
    }
    return new ClassPropertyOp(
      this.id,
      this.place,
      newKey,
      this.value,
      this.computed,
      this.isStatic,
      newCaptures,
    );
  }

  getOperands(): Value[] {
    return [this.key, ...this.captures];
  }
}
