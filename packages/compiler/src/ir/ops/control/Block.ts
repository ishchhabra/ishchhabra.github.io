import type { OperationId } from "../../core";
import type { Value } from "../../core/Value";
import type { LexicalScopeKind } from "../../core/LexicalScope";
import { type CloneContext, nextId, Operation, remapRegion, Trait } from "../../core/Operation";
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

  getOperands(): Value[] {
    return [];
  }

  override getDefs(): Value[] {
    return [];
  }

  rewrite(_values: Map<Value, Value>): BlockOp {
    return this;
  }

  clone(ctx: CloneContext): BlockOp {
    return new BlockOp(nextId(ctx), remapRegion(ctx, this.regions[0]), this.kind);
  }
}
