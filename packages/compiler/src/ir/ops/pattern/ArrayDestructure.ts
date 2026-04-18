import {
  destructureTargetHasObservableWrites,
  getDestructureTargetDefs,
  getDestructureTargetOperands,
  rewriteDestructureTarget,
  type DestructureTarget,
  type Value,
} from "../../core";
import { OperationId } from "../../core";
import type { StoreLocalKind } from "../mem/StoreLocal";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class ArrayDestructureOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly elements: Array<DestructureTarget | null>,
    public readonly value: Value,
    public readonly kind: StoreLocalKind,
    public readonly declarationKind: "let" | "const" | "var" | null = null,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ArrayDestructureOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      ArrayDestructureOp,
      place,
      this.elements,
      this.value,
      this.kind,
      this.declarationKind,
    );
  }

  rewrite(
    values: Map<Value, Value>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): ArrayDestructureOp {
    return new ArrayDestructureOp(
      this.id,
      this.place,
      this.elements.map((element) =>
        element === null ? null : rewriteDestructureTarget(element, values, { rewriteDefinitions }),
      ),
      this.value.rewrite(values),
      this.kind,
      this.declarationKind,
    );
  }

  getOperands(): Value[] {
    return [
      this.value,
      ...getDestructureTargetOperands({ kind: "array", elements: this.elements }),
    ];
  }

  override getDefs(): Value[] {
    return [this.place, ...getDestructureTargetDefs({ kind: "array", elements: this.elements })];
  }

  public override hasSideEffects(): boolean {
    return destructureTargetHasObservableWrites({ kind: "array", elements: this.elements });
  }
}
