import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, JSXInstruction } from "../../base";
import { Place } from "../../core";

/**
 * Represents a JSX namespaced name in the IR.
 *
 * Examples:
 * - `svg:rect` in `<svg:rect>`
 * - `xml:space` in `<xml:space>`
 */
export class JSXNamespacedNameInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.Node> | undefined,
    public readonly namespace: string,
    public readonly name: string,
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): JSXNamespacedNameInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      JSXNamespacedNameInstruction,
      place,
      this.nodePath,
      this.namespace,
      this.name,
    );
  }

  rewrite(): BaseInstruction {
    return this;
  }

  getReadPlaces(): Place[] {
    return [];
  }

  public get isPure(): boolean {
    return true;
  }
}
