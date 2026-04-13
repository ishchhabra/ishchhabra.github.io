import type { OperationId } from "../../core";
import type { BlockId } from "../../core/Block";
import type { Identifier } from "../../core/Identifier";
import {
  type CloneContext,
  nextId,
  Operation,
  remapBlockId,
  remapPlace,
  Trait,
  VerifyError,
} from "../../core/Operation";
import type { Place } from "../../core/Place";

/**
 * Conditional branch: flat CFG goto-style fork. Three successors —
 * `consequent` (taken when `test` is truthy), `alternate` (otherwise),
 * and `fallthrough` (the join block both arms eventually converge on).
 *
 * Used inside regions to express `if`/`else`/short-circuits before
 * structured recovery lifts them into {@link TernaryOp}. Replaces
 * `BranchTerminal`.
 */
export class BranchOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public readonly test: Place,
    public consequent: BlockId,
    public alternate: BlockId,
    public fallthrough: BlockId,
  ) {
    super(id);
  }

  getOperands(): Place[] {
    return [this.test];
  }

  rewrite(values: Map<Identifier, Place>): BranchOp {
    const test = values.get(this.test.identifier) ?? this.test;
    if (test === this.test) return this;
    return new BranchOp(this.id, test, this.consequent, this.alternate, this.fallthrough);
  }

  clone(ctx: CloneContext): BranchOp {
    return new BranchOp(
      nextId(ctx),
      remapPlace(ctx, this.test),
      remapBlockId(ctx, this.consequent),
      remapBlockId(ctx, this.alternate),
      remapBlockId(ctx, this.fallthrough),
    );
  }

  override remap(from: BlockId, to: BlockId): void {
    if (this.consequent === from) this.consequent = to;
    if (this.alternate === from) this.alternate = to;
    if (this.fallthrough === from) this.fallthrough = to;
  }

  override getBlockRefs(): BlockId[] {
    return [this.consequent, this.alternate, this.fallthrough];
  }

  override getJoinTarget(): BlockId {
    return this.fallthrough;
  }

  public override print(): string {
    return `branch ${this.test.print()} ? bb${this.consequent} : bb${this.alternate}`;
  }

  override verify(): void {
    super.verify();
    // consequent / alternate should be distinct — a branch whose two
    // arms point at the same block is a degenerate form that the
    // frontend should never emit.
    if (this.consequent === this.alternate) {
      throw new VerifyError(this, `consequent === alternate (bb${this.consequent})`);
    }
  }
}
