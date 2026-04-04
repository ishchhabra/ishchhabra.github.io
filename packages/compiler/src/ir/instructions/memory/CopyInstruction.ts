import { Environment } from "../../../environment";
import { InstructionId, MemoryInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a memory instruction that copies the value of one place to another.
 *
 * For example, Copy(lval: x, value: y) means that the value at place y is copied to x.
 */
export class CopyInstruction extends MemoryInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly lval: Place,
    public readonly value: Place,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): CopyInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      CopyInstruction,
      place,
      this.lval,
      this.value,
    );
  }

  rewrite(values: Map<Identifier, Place>): CopyInstruction {
    return new CopyInstruction(
      this.id,
      this.place,
      values.get(this.lval.identifier) ?? this.lval,
      values.get(this.value.identifier) ?? this.value,
    );
  }

  getOperands(): Place[] {
    return [this.lval, this.value];
  }

  override getDefs(): Place[] {
    return [this.place, this.lval];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = Copy ${this.lval.print()} <- ${this.value.print()}`;
  }
}
