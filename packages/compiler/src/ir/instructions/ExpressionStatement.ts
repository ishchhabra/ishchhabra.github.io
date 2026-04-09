import { Environment } from "../../environment";
import type { ModuleIR } from "../core/ModuleIR";
import { BaseInstruction, InstructionId } from "../base";
import { Identifier, Place } from "../core";

/**
 * Represents an expression statement in the IR.
 *
 * An expression statement is a statement that contains an expression.
 *
 * For example, `x + 1` is an expression statement.
 */
export class ExpressionStatementInstruction extends BaseInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly expression: Place,
  ) {
    super(id, place);
  }

  public override hasSideEffects(environment: Environment): boolean {
    const expressionInstruction = environment.placeToInstruction.get(this.expression.id);
    if (!expressionInstruction) {
      // The expression Place is not defined by any instruction — it's a
      // phi variable or function parameter. These are pure value references
      // with no side effects.
      return false;
    }

    // The wrapper is side-effecting if the expression itself is, or if
    // the expression defines additional places beyond its own (e.g.
    // CopyInstruction writes to lval). Removing the wrapper would lose
    // those definitions.
    return (
      expressionInstruction.hasSideEffects(environment) ||
      expressionInstruction.getDefs().length > 1
    );
  }

  public clone(moduleIR: ModuleIR): ExpressionStatementInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      ExpressionStatementInstruction,
      place,
      this.expression,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new ExpressionStatementInstruction(
      this.id,
      this.place,
      values.get(this.expression.identifier) ?? this.expression,
    );
  }

  getOperands(): Place[] {
    return [this.expression];
  }

  public override print(): string {
    return `ExpressionStatement ${this.expression.print()}`;
  }
}
