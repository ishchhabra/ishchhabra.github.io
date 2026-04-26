import { OperationId } from "../../core";
import { Value } from "../../core";
import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
import { effects, type MemoryEffects } from "../../memory/MemoryLocation";

export type BindingKind = "var" | "let" | "const";
export type BindingDeclKind = Exclude<BindingKind, "const">;

/**
 * Introduces a JavaScript binding in the lowered output.
 *
 * This op models binding creation only. It does not write a runtime value;
 * value writes are represented by {@link StoreLocalOp}.
 */
export class BindingDeclOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly kind: BindingDeclKind,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): BindingDeclOp {
    const env = ctx.environment;
    return env.createOperation(BindingDeclOp, env.createValue(this.place.declarationId), this.kind);
  }

  rewrite(
    values: Map<Value, Value>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): BindingDeclOp {
    return new BindingDeclOp(
      this.id,
      rewriteDefinitions ? (values.get(this.place) ?? this.place) : this.place,
      this.kind,
    );
  }

  operands(): Value[] {
    return [];
  }

  override results(): Value[] {
    return [this.place];
  }

  // Five-axis effects: introduces a binding name; no runtime value
  // is written by this op (initialization is a separate StoreLocal /
  // BindingInit). All-clean.
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
  public override getMemoryEffects(): MemoryEffects {
    return { reads: [], writes: [] };
  }

  public override print(): string {
    return `binding_decl ${this.kind} ${this.place.print()}`;
  }
}

/**
 * Introduces and initializes a JavaScript binding in one statement.
 *
 * This op makes `const` declarations structurally valid: a `const`
 * binding can only appear with its initializer operand.
 */
export class BindingInitOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly kind: BindingKind,
    public readonly value: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): BindingInitOp {
    const env = ctx.environment;
    return env.createOperation(
      BindingInitOp,
      env.createValue(this.place.declarationId),
      this.kind,
      this.value,
    );
  }

  rewrite(
    values: Map<Value, Value>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): BindingInitOp {
    return new BindingInitOp(
      this.id,
      rewriteDefinitions ? (values.get(this.place) ?? this.place) : this.place,
      this.kind,
      values.get(this.value) ?? this.value,
    );
  }

  operands(): Value[] {
    return [this.value];
  }

  override results(): Value[] {
    return [this.place];
  }

  // Five-axis effects: structurally introduces a `const`/`let`/`var`
  // binding with an initializer. The value computation is a
  // separate operand op carrying its own effects; the BindingInit
  // op itself is treated as having no memory writes — DCE relies
  // on the unused-result check (`results()[i].users.size === 0`)
  // to decide whether the binding can be dropped, mirroring the
  // pre-five-axis behavior where BindingInit's effect was "whatever
  // the value's effect is."
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
  public override getMemoryEffects(): MemoryEffects {
    return effects([], []);
  }

  public override print(): string {
    return `${this.place.print()} = binding_init ${this.kind} ${this.value.print()}`;
  }
}
