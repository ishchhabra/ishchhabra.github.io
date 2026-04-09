import { Environment } from "../../../environment";
import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

export type UnaryOperator = "-" | "+" | "!" | "~" | "typeof" | "void" | "delete";

/**
 * Represents a unary expression.
 *
 * Example:
 * !a
 * delete a
 */
export class UnaryExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly operator: UnaryOperator,
    public readonly argument: Place,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): UnaryExpressionInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      UnaryExpressionInstruction,
      place,
      this.operator,
      this.argument,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new UnaryExpressionInstruction(
      this.id,
      this.place,
      this.operator,
      values.get(this.argument.identifier) ?? this.argument,
    );
  }

  getOperands(): Place[] {
    return [this.argument];
  }

  public override hasSideEffects(environment: Environment): boolean {
    if (["throw", "delete"].includes(this.operator)) {
      return true;
    }

    // `void expr` evaluates its operand then discards the result.
    // The void itself is pure, but if the operand is side-effectful
    // (e.g. `void fetch(url)`) the overall expression is too.
    if (this.operator === "void") {
      const argInstr = environment.placeToInstruction.get(this.argument.id);
      return argInstr ? argInstr.hasSideEffects(environment) : false;
    }

    return false;
  }

  public override print(): string {
    return `${this.place.print()} = ${this.operator}${this.argument.print()}`;
  }
}
