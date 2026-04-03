import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ModuleInstruction } from "../../base";
import { Place } from "../../core";

export interface ExportFromSpecifier {
  local: string;
  exported: string;
}

/**
 * Represents a re-export declaration.
 *
 * Example:
 * export { chunk, compact } from './array/utils.mjs';
 */
export class ExportFromInstruction extends ModuleInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly source: string,
    public specifiers: ExportFromSpecifier[],
  ) {
    super(id, place);
  }

  public clone(environment: Environment): ExportFromInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(ExportFromInstruction, place, this.source, [
      ...this.specifiers,
    ]);
  }

  rewrite(): BaseInstruction {
    return this;
  }

  getReadPlaces(): Place[] {
    return [];
  }
}
