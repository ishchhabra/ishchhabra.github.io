import type { OperationId } from "../../core";
import type { Identifier } from "../../core/Identifier";
import type { LexicalScopeKind } from "../../core/LexicalScope";
import { type CloneContext, nextId, Operation, remapRegion, Trait } from "../../core/Operation";
import type { Place } from "../../core/Place";
import { Region } from "../../core/Region";

/**
 * Source-level lexical scope marker. Owns a single body region
 * whose `scopeKind` records the ECMAScript scope kind (naked
 * `{ ... }` block, `for (let ...)` scope, class body, catch
 * parameter binding, etc.).
 *
 * The class name is `BlockOp` (as in "block statement"), distinct
 * from `BasicBlock` which is the IR-level CFG node type.
 *
 * Inline structured op — lives directly in its parent block, no
 * fallthrough field.
 */
export class BlockOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  constructor(
    id: OperationId,
    bodyRegion: Region,
    public readonly kind: LexicalScopeKind = "block",
  ) {
    bodyRegion.scopeKind = kind;
    super(id, [bodyRegion]);
  }

  get bodyRegion(): Region {
    return this.regions[0];
  }

  getOperands(): Place[] {
    return [];
  }

  override getDefs(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): BlockOp {
    return this;
  }

  clone(ctx: CloneContext): BlockOp {
    return new BlockOp(nextId(ctx), remapRegion(ctx, this.regions[0]), this.kind);
  }
}
