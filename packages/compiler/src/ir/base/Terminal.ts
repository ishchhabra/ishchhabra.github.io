import { Environment } from "../../environment";
import { type BlockId, Identifier, type Place } from "../core";
import { type InstructionId } from "./Instruction";

export abstract class BaseTerminal {
  constructor(public readonly id: InstructionId) {}

  abstract getOperands(): Place[];

  abstract rewrite(values: Map<Identifier, Place>): BaseTerminal;

  /**
   * Deep clone the terminal with a fresh instruction id, block targets
   * remapped through `blockMap`, and places rewritten through `identifierMap`.
   */
  abstract clone(
    environment: Environment,
    blockMap: Map<BlockId, BlockId>,
    identifierMap: Map<Identifier, Place>,
  ): BaseTerminal;

  /** Replaces block references to `from` with `to` in place. */
  abstract remap(from: BlockId, to: BlockId): void;

  /** Returns all block IDs referenced by this terminal. */
  abstract getBlockRefs(): BlockId[];

  /** Returns the fallthrough (join) block if this terminal has one, or null. */
  getJoinTarget(): BlockId | null {
    return null;
  }

  public print(): string {
    return this.constructor.name;
  }
}
