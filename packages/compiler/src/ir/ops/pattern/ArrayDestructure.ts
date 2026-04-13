import {
  destructureTargetHasObservableWrites,
  getDestructureTargetDefs,
  getDestructureTargetOperands,
  rewriteDestructureTarget,
  type DestructureTarget,
  type Identifier,
  type Place,
} from "../../core";
import { OperationId } from "../../core";
import type { StoreLocalKind } from "../mem/StoreLocal";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class ArrayDestructureOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly elements: Array<DestructureTarget | null>,
    public readonly value: Place,
    public readonly kind: StoreLocalKind,
    public readonly declarationKind: "let" | "const" | "var" | null = null,
    public emit = true,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ArrayDestructureOp {
    const moduleIR = ctx.moduleIR;
    const place = moduleIR.environment.createPlace(moduleIR.environment.createIdentifier());
    return moduleIR.environment.createOperation(
      ArrayDestructureOp,
      place,
      this.elements,
      this.value,
      this.kind,
      this.declarationKind,
      this.emit,
    );
  }

  rewrite(
    values: Map<Identifier, Place>,
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
      this.emit,
    );
  }

  getOperands(): Place[] {
    return [
      this.value,
      ...getDestructureTargetOperands({ kind: "array", elements: this.elements }),
    ];
  }

  override getDefs(): Place[] {
    return [this.place, ...getDestructureTargetDefs({ kind: "array", elements: this.elements })];
  }

  public override hasSideEffects(): boolean {
    return destructureTargetHasObservableWrites({ kind: "array", elements: this.elements });
  }
}
