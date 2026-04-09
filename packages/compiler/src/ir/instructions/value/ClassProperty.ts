import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";
import { FunctionIR } from "../../core/FunctionIR";

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
 * The initializer is stored as its own {@link FunctionIR} "thunk" so
 * that capture analysis and per-instance evaluation work naturally.
 * Codegen extracts the thunk's single return expression and plants it
 * into the emitted `t.classProperty` node. For an uninitialized field
 * (`x;`), the value is `null`.
 *
 * Non-computed identifier keys are stored as a {@link Place} referencing
 * a {@link LiteralInstruction}, matching the convention in
 * {@link ClassMethodInstruction} and {@link ObjectPropertyInstruction}.
 */
export class ClassPropertyInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly key: Place,
    public readonly value: FunctionIR | null,
    public readonly computed: boolean,
    public readonly isStatic: boolean,
    public readonly captures: Place[] = [],
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): ClassPropertyInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      ClassPropertyInstruction,
      place,
      this.key,
      this.value,
      this.computed,
      this.isStatic,
      this.captures,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    const newKey = values.get(this.key.identifier) ?? this.key;
    const newCaptures = this.captures.map((c) => c.rewrite(values));
    const capturesChanged = newCaptures.some((c, i) => c !== this.captures[i]);
    if (newKey === this.key && !capturesChanged) {
      return this;
    }
    return new ClassPropertyInstruction(
      this.id,
      this.place,
      newKey,
      this.value,
      this.computed,
      this.isStatic,
      newCaptures,
    );
  }

  getOperands(): Place[] {
    return [this.key, ...this.captures];
  }
}
