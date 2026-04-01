import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { InstructionId, MemoryInstruction } from "../../base";
import { Identifier, Place } from "../../core";

export type StoreContextKind = "declaration" | "assignment";

/**
 * Represents a memory instruction that stores a value to a context variable —
 * a mutable variable captured across closure boundaries. Semantically identical
 * to StoreLocalInstruction at codegen time, but treated differently by SSA
 * (skipped during phi placement and renaming) and by optimization passes
 * (stores are considered side-effecting because closures may observe them).
 */
export class StoreContextInstruction extends MemoryInstruction {
  public emit: boolean = true;

  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.Node> | undefined,
    public readonly lval: Place,
    public readonly value: Place,
    public readonly type: "let" | "var",
    public readonly kind: StoreContextKind,
    public readonly bindings: Place[] = [],
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): StoreContextInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      StoreContextInstruction,
      place,
      this.nodePath,
      this.lval,
      this.value,
      this.type,
      this.kind,
      this.bindings,
    );
  }

  rewrite(
    values: Map<Identifier, Place>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): StoreContextInstruction {
    const value = this.value.rewrite(values);
    const lval = rewriteDefinitions ? this.lval.rewrite(values) : this.lval;

    let bindings = this.bindings;
    if (rewriteDefinitions && bindings.length) {
      const next = bindings.map((b) => b.rewrite(values));
      if (next.some((b, i) => b !== bindings[i])) bindings = next;
    }

    if (value === this.value && lval === this.lval && bindings === this.bindings) {
      return this;
    }

    return new StoreContextInstruction(
      this.id,
      this.place,
      this.nodePath,
      lval,
      value,
      this.type,
      this.kind,
      bindings,
    );
  }

  getReadPlaces(): Place[] {
    return [this.value];
  }

  override getWrittenPlaces(): Place[] {
    return [this.place, this.lval, ...this.bindings];
  }
}
