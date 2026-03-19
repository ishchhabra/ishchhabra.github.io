import { Identifier, type Place } from "../core";
import { type InstructionId } from "./Instruction";

export abstract class BaseTerminal {
  constructor(public readonly id: InstructionId) {}

  abstract getReadPlaces(): Place[];

  abstract rewrite(values: Map<Identifier, Place>): BaseTerminal;
}
