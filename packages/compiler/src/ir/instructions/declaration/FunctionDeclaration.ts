import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, DeclarationInstruction } from "../../base";
import { FunctionIR } from "../../core/FunctionIR";
import { Identifier, Place } from "../../core";

export class FunctionDeclarationInstruction extends DeclarationInstruction {
  constructor(
    public readonly id: import("../../base").InstructionId,
    public readonly place: Place,
    public readonly functionIR: FunctionIR,
    public readonly generator: boolean,
    public readonly async: boolean,
    public readonly captures: Place[] = [],
    public emit = true,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): FunctionDeclarationInstruction {
    // Use a fresh declarationId — the clone is a distinct binding from the
    // original, not a new SSA version. Don't copy the original name either,
    // so the cloned function gets its own auto-generated `$<id>` name and
    // can't collide at codegen time.
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    // Recursively deep-clone the nested FunctionIR into the same target
    // module so the cloned declaration owns an independent body.
    return moduleIR.environment.createInstruction(
      FunctionDeclarationInstruction,
      place,
      this.functionIR.clone(moduleIR),
      this.generator,
      this.async,
      this.captures,
      this.emit,
    );
  }

  public rewrite(values: Map<Identifier, Place>): BaseInstruction {
    const newCaptures = this.captures.map((capture) => capture.rewrite(values));
    const capturesChanged = newCaptures.some((capture, index) => capture !== this.captures[index]);
    if (!capturesChanged) {
      return this;
    }

    return new FunctionDeclarationInstruction(
      this.id,
      this.place,
      this.functionIR,
      this.generator,
      this.async,
      newCaptures,
      this.emit,
    );
  }

  public getOperands(): Place[] {
    return this.captures;
  }

  public override getDefs(): Place[] {
    return [this.place];
  }
}
