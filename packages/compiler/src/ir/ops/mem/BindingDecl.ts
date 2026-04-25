import { OperationId } from "../../core";
import { Value } from "../../core";
import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";

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

  public override hasSideEffects(_env?: Parameters<Operation["hasSideEffects"]>[0]): boolean {
    return false;
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

  public override hasSideEffects(env?: Parameters<Operation["hasSideEffects"]>[0]): boolean {
    if (env === undefined) return true;
    return this.value.def?.hasSideEffects(env) ?? false;
  }

  public override print(): string {
    return `${this.place.print()} = binding_init ${this.kind} ${this.value.print()}`;
  }
}
