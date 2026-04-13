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

export interface SwitchCase {
  /** `null` for the `default:` case. */
  test: Place | null;
  block: BlockId;
}

/**
 * `switch (discriminant) { case a: ... default: ... }`. Terminator
 * with one successor per case plus `fallthrough`. Replaces
 * `SwitchTerminal`.
 */
export class SwitchOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public readonly discriminant: Place,
    public readonly cases: SwitchCase[],
    public fallthrough: BlockId,
    public readonly label?: string,
  ) {
    super(id);
  }

  getOperands(): Place[] {
    const places = [this.discriminant];
    for (const c of this.cases) {
      if (c.test !== null) {
        places.push(c.test);
      }
    }
    return places;
  }

  rewrite(values: Map<Identifier, Place>): SwitchOp {
    const discriminant = values.get(this.discriminant.identifier) ?? this.discriminant;
    const cases = this.cases.map((c) => ({
      test: c.test !== null ? (values.get(c.test.identifier) ?? c.test) : null,
      block: c.block,
    }));
    if (
      discriminant === this.discriminant &&
      cases.every((c, i) => c.test === this.cases[i]!.test)
    ) {
      return this;
    }
    return new SwitchOp(this.id, discriminant, cases, this.fallthrough, this.label);
  }

  clone(ctx: CloneContext): SwitchOp {
    return new SwitchOp(
      nextId(ctx),
      remapPlace(ctx, this.discriminant),
      this.cases.map((c) => ({
        test: c.test === null ? null : remapPlace(ctx, c.test),
        block: remapBlockId(ctx, c.block),
      })),
      remapBlockId(ctx, this.fallthrough),
      this.label,
    );
  }

  override remap(from: BlockId, to: BlockId): void {
    for (const c of this.cases) {
      if (c.block === from) c.block = to;
    }
    if (this.fallthrough === from) this.fallthrough = to;
  }

  override getBlockRefs(): BlockId[] {
    return [...this.cases.map((c) => c.block), this.fallthrough];
  }

  override getJoinTarget(): BlockId {
    return this.fallthrough;
  }

  override verify(): void {
    super.verify();
    if (this.cases.length === 0) {
      throw new VerifyError(this, "switch has 0 cases");
    }
    // At most one default case.
    let defaultCount = 0;
    for (const c of this.cases) {
      if (c.test === null) defaultCount++;
    }
    if (defaultCount > 1) {
      throw new VerifyError(this, `switch has ${defaultCount} default cases`);
    }
  }
}
