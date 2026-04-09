import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a `super(args)` call inside a derived class constructor.
 *
 * `super` is not a value — it cannot be stored, passed, or returned.
 * This instruction models the specific syntactic form `super(...)` as a
 * first-class IR node so that no Place is created for `super` itself.
 *
 * The result `place` represents the return value of the super call
 * (the newly constructed instance).
 */
export class SuperCallInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly args: Place[],
  ) {
    super(id, place);
  }

  public clone(environment: Environment): SuperCallInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(SuperCallInstruction, place, this.args);
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    const newArgs = this.args.map((arg) => arg.rewrite(values));
    const changed = newArgs.some((a, i) => a !== this.args[i]);
    if (!changed) return this;
    return new SuperCallInstruction(this.id, this.place, newArgs);
  }

  getOperands(): Place[] {
    return this.args;
  }
}
