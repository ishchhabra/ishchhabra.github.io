import { BlockId, DeclarationId, IdentifierId, Place } from "../../ir";

export function makePhiIdentifierName(id: IdentifierId): string {
  return `phi_${id}`;
}

/**
 * Represents a Phi node in the SSA form.
 */
export class Phi {
  constructor(
    public readonly blockId: BlockId,
    public readonly place: Place,
    public readonly operands: Map<BlockId, Place>,
    /** The declaration ID of the variable that this Phi node represents. */
    public readonly declarationId: DeclarationId,
  ) {}

  /**
   * Remove the operand from `blockId` and return the resulting state.
   *   - `"ok"` — operand removed, 2+ operands remain.
   *   - `"single"` — operand removed, exactly 1 remains (should degrade).
   *   - `"empty"` — operand removed, 0 remain (phi is dead).
   *   - `"missing"` — `blockId` was not an operand.
   */
  removeOperand(blockId: BlockId): "ok" | "single" | "empty" | "missing" {
    if (!this.operands.delete(blockId)) return "missing";
    if (this.operands.size === 1) return "single";
    if (this.operands.size === 0) return "empty";
    return "ok";
  }

  /**
   * Returns the single remaining operand's place.
   * Only valid when `operands.size === 1`.
   */
  getSingleOperand(): Place {
    const [[, place]] = this.operands.entries();
    return place;
  }
}
