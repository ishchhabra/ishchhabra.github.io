import { BlockId } from "../../core/Block";
import type { DeclarationId, Identifier, IdentifierId } from "../../core/Identifier";
import {
  type CloneContext,
  nextId,
  Operation,
  type OperationId,
  remapBlockId,
  remapPlace,
  Trait,
  VerifyError,
} from "../../core/Operation";
import type { Place } from "../../core/Place";

export function makePhiIdentifierName(id: IdentifierId): string {
  return `phi_${id}`;
}

/**
 * SSA phi node. In classical SSA this is a pseudo-op at the head of a
 * join block that selects between operand places depending on which
 * predecessor edge the control flow arrived from.
 *
 * `PhiOp` replaces the old standalone `Phi` class. It extends
 * {@link Operation} like every other op and lives in
 * `FunctionIR.phis` until SSA elimination lowers it away. (A
 * follow-up refactor will move phis into the block's `operations`
 * list as the first N ops, matching MLIR convention. For now they
 * still sit in the side set.)
 *
 * Declares {@link Trait.Pure} — a phi is a pure value selector with
 * no observable effect.
 */
export class PhiOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Pure]);

  constructor(
    id: OperationId,
    /** Block this phi belongs to. */
    public readonly blockId: BlockId,
    public override readonly place: Place,
    /** Incoming edge → value-at-edge map. */
    public readonly operands: Map<BlockId, Place>,
    /** Declaration id of the variable this phi represents a merged version of. */
    public readonly declarationId: DeclarationId,
  ) {
    super(id);
  }

  getOperands(): Place[] {
    return Array.from(this.operands.values());
  }

  override getDefs(): Place[] {
    return [this.place];
  }

  override hasSideEffects(): boolean {
    return false;
  }

  rewrite(values: Map<Identifier, Place>): PhiOp {
    let changed = false;
    const newOperands = new Map<BlockId, Place>();
    for (const [predBlockId, operandPlace] of this.operands) {
      const next = values.get(operandPlace.identifier) ?? operandPlace;
      if (next !== operandPlace) changed = true;
      newOperands.set(predBlockId, next);
    }
    if (!changed) return this;
    return new PhiOp(this.id, this.blockId, this.place, newOperands, this.declarationId);
  }

  clone(ctx: CloneContext): PhiOp {
    const newBlockId = remapBlockId(ctx, this.blockId);
    const newPlace = remapPlace(ctx, this.place);
    const newOperands = new Map<BlockId, Place>();
    for (const [opBlockId, opPlace] of this.operands) {
      newOperands.set(remapBlockId(ctx, opBlockId), remapPlace(ctx, opPlace));
    }
    return new PhiOp(nextId(ctx), newBlockId, newPlace, newOperands, this.declarationId);
  }

  /**
   * Remove the operand from `blockId`. Returns the resulting state:
   *   - `"ok"`     — operand removed, ≥2 operands remain.
   *   - `"single"` — operand removed, exactly 1 remains (caller should degrade).
   *   - `"empty"`  — operand removed, 0 remain (phi is dead).
   *   - `"missing"`— `blockId` was not an operand in the first place.
   */
  removeOperand(blockId: BlockId): "ok" | "single" | "empty" | "missing" {
    if (!this.operands.delete(blockId)) return "missing";
    if (this.operands.size === 1) return "single";
    if (this.operands.size === 0) return "empty";
    return "ok";
  }

  /**
   * Returns the single remaining operand's place. Only valid when
   * `operands.size === 1`.
   */
  getSingleOperand(): Place {
    const [[, place]] = this.operands.entries();
    return place;
  }

  override verify(): void {
    super.verify();
    // A phi must have at least 1 operand (a degenerate 1-operand phi
    // should have been collapsed by PhiOptimizationPass, but we
    // accept it here to let the optimizer finish its work before
    // verify runs).
    if (this.operands.size === 0) {
      throw new VerifyError(this, "phi has 0 operands");
    }
  }
}
