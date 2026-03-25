import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ModuleInstruction } from "../../base";
import { Place } from "../../core";

/**
 * Represents an export-all re-export declaration.
 *
 * Example:
 * export * from './utils';
 */
export class ExportAllInstruction extends ModuleInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.Node> | undefined,
    public readonly source: string,
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): ExportAllInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(ExportAllInstruction, place, this.nodePath, this.source);
  }

  rewrite(): BaseInstruction {
    return this;
  }

  getReadPlaces(): Place[] {
    return [];
  }
}
