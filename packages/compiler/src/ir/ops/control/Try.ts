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
 * `try { ... } catch (e) { ... } finally { ... }`. Terminator.
 * Carries the try / catch / finally block ids and the catch
 * binding place. Replaces `TryTerminal`.
 */
export class TryOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public tryBlock: BlockId,
    public handler: { param: Place | null; block: BlockId } | null,
    public finallyBlock: BlockId | null,
    public fallthrough: BlockId,
  ) {
    super(id);
  }

  getOperands(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): TryOp {
    return this;
  }

  clone(ctx: CloneContext): TryOp {
    return new TryOp(
      nextId(ctx),
      remapBlockId(ctx, this.tryBlock),
      this.handler === null
        ? null
        : {
            param: this.handler.param === null ? null : remapPlace(ctx, this.handler.param),
            block: remapBlockId(ctx, this.handler.block),
          },
      this.finallyBlock === null ? null : remapBlockId(ctx, this.finallyBlock),
      remapBlockId(ctx, this.fallthrough),
    );
  }

  override remap(from: BlockId, to: BlockId): void {
    if (this.tryBlock === from) this.tryBlock = to;
    if (this.handler?.block === from) this.handler.block = to;
    if (this.finallyBlock === from) this.finallyBlock = to;
    if (this.fallthrough === from) this.fallthrough = to;
  }

  override getBlockRefs(): BlockId[] {
    const refs: BlockId[] = [this.tryBlock, this.fallthrough];
    if (this.handler) refs.push(this.handler.block);
    if (this.finallyBlock !== null) refs.push(this.finallyBlock);
    return refs;
  }

  override getJoinTarget(): BlockId {
    return this.fallthrough;
  }

  override verify(): void {
    super.verify();
    // A try op must have at least one of handler or finallyBlock —
    // a bare `try { }` with neither is a parse error.
    if (this.handler === null && this.finallyBlock === null) {
      throw new VerifyError(this, "try has neither catch handler nor finally block");
    }
    // tryBlock and fallthrough must be distinct (the try body always
    // falls out of its own scope before reaching the fallthrough).
    if (this.tryBlock === this.fallthrough) {
      throw new VerifyError(this, `tryBlock === fallthrough (bb${this.tryBlock})`);
    }
  }
}
