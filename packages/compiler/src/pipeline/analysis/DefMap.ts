import { BaseInstruction, IdentifierId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";

/**
 * Maps each identifier to the instruction that defines it.
 *
 * In SSA form, each identifier has exactly one definition, so this is a
 * simple lookup table built by scanning all instructions once. Used by
 * optimization passes to inspect the origin of a value — e.g. to check
 * whether a StoreLocal's value comes from an impure instruction.
 *
 * Intended to be transient: built at the start of each pass step and
 * discarded afterward, since instructions may change between steps.
 */
export class DefMap {
  private readonly map: Map<IdentifierId, BaseInstruction>;

  constructor(functionIR: FunctionIR) {
    this.map = new Map();
    for (const block of functionIR.blocks.values()) {
      for (const instr of block.instructions) {
        this.map.set(instr.place.identifier.id, instr);
      }
    }
  }

  /**
   * Returns the instruction that defines the given identifier, or
   * undefined if the identifier is not defined by any instruction
   * (e.g. a function parameter or external value).
   */
  getDefiner(id: IdentifierId): BaseInstruction | undefined {
    return this.map.get(id);
  }

  /**
   * Returns true if the given identifier is defined by an impure
   * instruction — one whose removal or detachment would lose an
   * observable side effect.
   */
  isImpure(id: IdentifierId): boolean {
    const definer = this.map.get(id);
    return definer !== undefined && !definer.isPure;
  }
}
