import { BaseInstruction, BaseTerminal } from "../base";
import { Identifier } from "./Identifier";
import { Place } from "./Place";

/**
 * Simulated opaque type for BlockId to prevent using normal numbers as ids
 * accidentally.
 */
const opaqueBlockId = Symbol();
export type BlockId = number & { [opaqueBlockId]: "BlockId" };

export function makeBlockId(id: number): BlockId {
  return id as BlockId;
}

// ---------------------------------------------------------------------------
// Use-chain helpers (not exported — only used by BasicBlock methods)
// ---------------------------------------------------------------------------

type UseChainNode = {
  getReadPlaces(): readonly Place[];
  getWrittenPlaces?: () => readonly Place[];
};

function registerUses(user: UseChainNode): void {
  for (const place of user.getReadPlaces()) {
    place.identifier.uses.add(user);
  }
  if (user.getWrittenPlaces) {
    for (const place of user.getWrittenPlaces()) {
      place.identifier.definer = user;
    }
  }
}

function unregisterUses(user: UseChainNode): void {
  for (const place of user.getReadPlaces()) {
    place.identifier.uses.delete(user);
  }
  if (user.getWrittenPlaces) {
    for (const place of user.getWrittenPlaces()) {
      if (place.identifier.definer === user) {
        place.identifier.definer = undefined;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// BasicBlock
// ---------------------------------------------------------------------------

export class BasicBlock {
  private _terminal: BaseTerminal | undefined;

  constructor(
    public readonly id: BlockId,
    public instructions: BaseInstruction[],
    terminal: BaseTerminal | undefined,
  ) {
    // Bypass the setter for initial construction — the terminal is
    // brand-new and has no prior use-chain entries to unregister.
    this._terminal = terminal;
    if (terminal) registerUses(terminal);
  }

  /** Terminal accessor — the setter auto-maintains use-chains. */
  get terminal(): BaseTerminal | undefined {
    return this._terminal;
  }

  set terminal(newTerminal: BaseTerminal | undefined) {
    if (this._terminal) unregisterUses(this._terminal);
    if (newTerminal) registerUses(newTerminal);
    this._terminal = newTerminal;
  }

  // -----------------------------------------------------------------------
  // Instruction mutations — automatically maintain Identifier.uses
  // -----------------------------------------------------------------------

  /** Append an instruction and register its use-chain entries. */
  appendInstruction(instr: BaseInstruction): void {
    registerUses(instr);
    this.instructions.push(instr);
  }

  /** Replace the instruction at `index` and update use-chains. */
  replaceInstruction(index: number, newInstr: BaseInstruction): void {
    const old = this.instructions[index];
    unregisterUses(old);
    registerUses(newInstr);
    this.instructions[index] = newInstr;
  }

  /** Remove the instruction at `index` and unregister its use-chains. */
  removeInstructionAt(index: number): void {
    unregisterUses(this.instructions[index]);
    this.instructions.splice(index, 1);
  }

  /** Insert an instruction at `index` and register its use-chain entries. */
  insertInstructionAt(index: number, instr: BaseInstruction): void {
    registerUses(instr);
    this.instructions.splice(index, 0, instr);
  }

  /** Remove all instructions and unregister their use-chain entries. */
  clearInstructions(): void {
    for (const instr of this.instructions) {
      unregisterUses(instr);
    }
    this.instructions = [];
  }

  // -----------------------------------------------------------------------
  // Terminal — convenience alias (delegates to setter)
  // -----------------------------------------------------------------------

  /** Replace the terminal and update use-chains. */
  replaceTerminal(newTerminal: BaseTerminal | undefined): void {
    this.terminal = newTerminal;
  }

  /**
   * Rewrite all instructions and the terminal using the given
   * identifier → place mapping. Instructions whose rewrite produces
   * a different object are replaced (with use-chain updates).
   */
  rewriteAll(values: Map<Identifier, Place>): void {
    for (let i = 0; i < this.instructions.length; i++) {
      const instr = this.instructions[i];
      const rewritten = instr.rewrite(values);
      if (rewritten !== instr) {
        this.replaceInstruction(i, rewritten);
      }
    }
    if (this._terminal) {
      const rewritten = this._terminal.rewrite(values);
      if (rewritten !== this._terminal) {
        this.terminal = rewritten;
      }
    }
  }
}
