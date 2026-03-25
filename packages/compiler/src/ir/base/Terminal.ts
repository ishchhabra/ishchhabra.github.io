import { type BlockId, Identifier, type Place } from "../core";
import { type InstructionId } from "./Instruction";

export abstract class BaseTerminal {
  constructor(public readonly id: InstructionId) {}

  abstract getReadPlaces(): Place[];

  abstract rewrite(values: Map<Identifier, Place>): BaseTerminal;

  /** Replaces block references to `from` with `to` in place. */
  abstract remap(from: BlockId, to: BlockId): void;

  /** Returns all block IDs referenced by this terminal. */
  abstract getBlockRefs(): BlockId[];

  /** Returns the fallthrough (join) block if this terminal has one, or null. */
  getJoinTarget(): BlockId | null {
    return null;
  }
}
