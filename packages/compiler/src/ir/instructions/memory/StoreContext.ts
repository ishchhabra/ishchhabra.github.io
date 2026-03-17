import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { InstructionId, MemoryInstruction } from "../../base";
import { Identifier, Place } from "../../core";

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
    public readonly type: "let" | "const" | "var",
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
    );
  }

  rewrite(
    values: Map<Identifier, Place>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): StoreContextInstruction {
    return new StoreContextInstruction(
      this.id,
      this.place,
      this.nodePath,
      rewriteDefinitions ? (values.get(this.lval.identifier) ?? this.lval) : this.lval,
      values.get(this.value.identifier) ?? this.value,
      this.type,
    );
  }

  getReadPlaces(): Place[] {
    return [this.value];
  }

  override getWrittenPlaces(): Place[] {
    return [this.place, this.lval];
  }

  public get isPure(): boolean {
    return false;
  }
}
