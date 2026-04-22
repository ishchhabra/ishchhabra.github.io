/**
 * CFG-style structured terminators.
 *
 * This file is the landing zone for the MLIR-regions → CFG-with-
 * structured-terminator-kinds pivot. Each terminator below replaces
 * one of the existing region-owning structured ops (TryOp, SwitchOp,
 * IfOp, WhileOp, ForOp, ForOfOp, ForInOp, LabeledBlockOp) with a
 * block-terminator that names its successor blocks instead of owning
 * them through regions.
 *
 * Design:
 *   - All referenced blocks live as siblings in the enclosing
 *     function's flat block list. No Region ownership.
 *   - Terminator carries the structural kind + auxiliary data
 *     (catch param, label, loop variant, case tests) needed by
 *     codegen to reconstruct JS.
 *   - SSA merges flow through block parameters on successor blocks
 *     (same mechanism as plain JumpOp) — no YieldOp, no iter-args
 *     machinery, no resultPlaces field.
 *
 * This file is introduced additively. The existing structured ops
 * continue to be emitted by the HIR builders and consumed by codegen
 * until their builders/consumers are migrated.
 */

import type { OperationId } from "../../core";
import type { BasicBlock, BlockId } from "../../core/Block";
import type { Value } from "../../core/Value";
import {
  type CloneContext,
  nextId,
  Operation,
  remapPlace,
  Trait,
} from "../../core/Operation";

// ---------------------------------------------------------------------
// IfTerm — if / else / conditional-expression
// ---------------------------------------------------------------------

/**
 * Two-way branch on a boolean-ish value.
 *
 *   if (cond) thenBlock else elseBlock
 *
 * `thenBlock` and `elseBlock` are sibling blocks in the enclosing
 * function body. Control rejoins at whatever block the two arms
 * branch to (typically via a plain `JumpOp` to a shared fallthrough
 * block). If the conditional is used as an expression, the
 * fallthrough block has a block parameter that receives the
 * expression value from each arm.
 *
 * `elseBlock` is required — the frontend synthesizes an empty block
 * that jumps directly to the fallthrough when there's no source
 * `else` clause.
 */
export class IfTerm extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public readonly cond: Value,
    public thenBlock: BasicBlock,
    public elseBlock: BasicBlock,
  ) {
    super(id, []);
  }

  getOperands(): Value[] {
    return [this.cond];
  }

  getBlockRefs(): BasicBlock[] {
    return [this.thenBlock, this.elseBlock];
  }

  rewrite(values: Map<Value, Value>): IfTerm {
    const newCond = values.get(this.cond) ?? this.cond;
    if (newCond === this.cond) return this;
    return new IfTerm(this.id, newCond, this.thenBlock, this.elseBlock);
  }

  clone(ctx: CloneContext): IfTerm {
    return new IfTerm(
      nextId(ctx),
      remapPlace(ctx, this.cond),
      ctx.blockMap.get(this.thenBlock) ?? this.thenBlock,
      ctx.blockMap.get(this.elseBlock) ?? this.elseBlock,
    );
  }
}

// ---------------------------------------------------------------------
// WhileTerm / DoWhileTerm — loop headers
// ---------------------------------------------------------------------

/**
 * Loop header for `while (cond) body` and `do body while (cond)`.
 *
 * `kind = "while"` evaluates `cond` before entering the body (the
 * block hosting this terminator IS the loop header); `kind =
 * "do-while"` semantically evaluates after the body, but lowered
 * with the same structure — the frontend arranges the CFG so the
 * first iteration enters `bodyBlock` unconditionally and subsequent
 * iterations pass through here.
 *
 * On each iteration: if `cond` is truthy → `bodyBlock`, else →
 * `exitBlock`. The body block's terminator branches back to this
 * header (forming the back-edge). Loop-carried values flow through
 * block parameters on the header (standard CFG SSA — no iter-args
 * machinery).
 */
export class WhileTerm extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public readonly cond: Value,
    public bodyBlock: BasicBlock,
    public exitBlock: BasicBlock,
    public readonly kind: "while" | "do-while",
    public readonly label?: string,
  ) {
    super(id, []);
  }

  getOperands(): Value[] {
    return [this.cond];
  }

  getBlockRefs(): BasicBlock[] {
    return [this.bodyBlock, this.exitBlock];
  }

  rewrite(values: Map<Value, Value>): WhileTerm {
    const newCond = values.get(this.cond) ?? this.cond;
    if (newCond === this.cond) return this;
    return new WhileTerm(this.id, newCond, this.bodyBlock, this.exitBlock, this.kind, this.label);
  }

  clone(ctx: CloneContext): WhileTerm {
    return new WhileTerm(
      nextId(ctx),
      remapPlace(ctx, this.cond),
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      ctx.blockMap.get(this.exitBlock) ?? this.exitBlock,
      this.kind,
      this.label,
    );
  }
}

// ---------------------------------------------------------------------
// ForTerm — C-style `for (init; test; update) body`
// ---------------------------------------------------------------------

/**
 * C-style for-loop header terminator.
 *
 * The init section runs before control reaches the header (it's
 * lowered as ordinary ops in the predecessor block). The header
 * evaluates `cond`: truthy → `bodyBlock`, falsey → `exitBlock`. The
 * body's natural terminator branches to `updateBlock` (where the
 * `update` clause's ops live), which then branches back to this
 * header.
 *
 * Break / continue are handled by the frontend emitting jumps
 * directly to `exitBlock` / `updateBlock` respectively.
 */
export class ForTerm extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public readonly cond: Value,
    public bodyBlock: BasicBlock,
    public updateBlock: BasicBlock,
    public exitBlock: BasicBlock,
    public readonly label?: string,
  ) {
    super(id, []);
  }

  getOperands(): Value[] {
    return [this.cond];
  }

  getBlockRefs(): BasicBlock[] {
    return [this.bodyBlock, this.updateBlock, this.exitBlock];
  }

  rewrite(values: Map<Value, Value>): ForTerm {
    const newCond = values.get(this.cond) ?? this.cond;
    if (newCond === this.cond) return this;
    return new ForTerm(
      this.id,
      newCond,
      this.bodyBlock,
      this.updateBlock,
      this.exitBlock,
      this.label,
    );
  }

  clone(ctx: CloneContext): ForTerm {
    return new ForTerm(
      nextId(ctx),
      remapPlace(ctx, this.cond),
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      ctx.blockMap.get(this.updateBlock) ?? this.updateBlock,
      ctx.blockMap.get(this.exitBlock) ?? this.exitBlock,
      this.label,
    );
  }
}

// ---------------------------------------------------------------------
// ForOfTerm / ForInTerm — iterator-driven loops
// ---------------------------------------------------------------------

/**
 * `for (target of iterable) body` / `for await (target of ...)`.
 *
 * Lowered as a header terminator that semantically asks the iterator
 * for the next value. If exhausted → `exitBlock`; otherwise bind
 * `iterationValue` (+ destructure via `iterationTarget` in the body
 * entry), then → `bodyBlock`.
 *
 * The body's natural terminator branches back to this header to
 * request the next iteration.
 *
 * Note: the iterator protocol mechanics (calling `Symbol.iterator`,
 * invoking `.next()`, checking `.done`) are encoded implicitly by
 * codegen emitting `for (const x of iter) { ... }`. Optimization
 * passes see the header as an opaque "iterator advance + done?"
 * node.
 */
export class ForOfTerm extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public readonly iterable: Value,
    public readonly iterationValue: Value,
    public bodyBlock: BasicBlock,
    public exitBlock: BasicBlock,
    public readonly isAwait: boolean,
    public readonly label?: string,
  ) {
    super(id, []);
  }

  getOperands(): Value[] {
    return [this.iterable];
  }

  override getDefs(): Value[] {
    return [this.iterationValue];
  }

  getBlockRefs(): BasicBlock[] {
    return [this.bodyBlock, this.exitBlock];
  }

  rewrite(values: Map<Value, Value>): ForOfTerm {
    const newIter = values.get(this.iterable) ?? this.iterable;
    if (newIter === this.iterable) return this;
    return new ForOfTerm(
      this.id,
      newIter,
      this.iterationValue,
      this.bodyBlock,
      this.exitBlock,
      this.isAwait,
      this.label,
    );
  }

  clone(ctx: CloneContext): ForOfTerm {
    return new ForOfTerm(
      nextId(ctx),
      remapPlace(ctx, this.iterable),
      remapPlace(ctx, this.iterationValue),
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      ctx.blockMap.get(this.exitBlock) ?? this.exitBlock,
      this.isAwait,
      this.label,
    );
  }
}

/**
 * `for (key in object) body`.
 *
 * Same shape as {@link ForOfTerm} but iterates enumerable keys of
 * `object` instead of a `@@iterator` protocol.
 */
export class ForInTerm extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public readonly object: Value,
    public readonly iterationValue: Value,
    public bodyBlock: BasicBlock,
    public exitBlock: BasicBlock,
    public readonly label?: string,
  ) {
    super(id, []);
  }

  getOperands(): Value[] {
    return [this.object];
  }

  override getDefs(): Value[] {
    return [this.iterationValue];
  }

  getBlockRefs(): BasicBlock[] {
    return [this.bodyBlock, this.exitBlock];
  }

  rewrite(values: Map<Value, Value>): ForInTerm {
    const newObj = values.get(this.object) ?? this.object;
    if (newObj === this.object) return this;
    return new ForInTerm(
      this.id,
      newObj,
      this.iterationValue,
      this.bodyBlock,
      this.exitBlock,
      this.label,
    );
  }

  clone(ctx: CloneContext): ForInTerm {
    return new ForInTerm(
      nextId(ctx),
      remapPlace(ctx, this.object),
      remapPlace(ctx, this.iterationValue),
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      ctx.blockMap.get(this.exitBlock) ?? this.exitBlock,
      this.label,
    );
  }
}

// ---------------------------------------------------------------------
// TryTerm — structured exception handling
// ---------------------------------------------------------------------

/**
 * `try { ... } catch (e) { ... } finally { ... }`.
 *
 * Lowered as a header terminator that transfers control to
 * `bodyBlock`. Any throwable op inside the try-body — both explicit
 * `throw` and implicit exception edges from calls — can route to
 * `handlerBlock` (for `catch`) or bypass straight to `finallyBlock`
 * (when no handler is present). After either arm completes, control
 * reaches `fallthroughBlock`.
 *
 * The handler's catch parameter (`handlerParam`, if present) is
 * bound on entry to `handlerBlock` — modeled as a block entry
 * binding rather than a block param because it's supplied by the
 * JS exception-throw mechanism, not by explicit operand forwarding.
 */
export class TryTerm extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public bodyBlock: BasicBlock,
    public handlerBlock: BasicBlock | null,
    public handlerParam: Value | null,
    public finallyBlock: BasicBlock | null,
    public fallthroughBlock: BasicBlock,
  ) {
    super(id, []);
  }

  getOperands(): Value[] {
    return [];
  }

  getBlockRefs(): BasicBlock[] {
    const refs: BasicBlock[] = [this.bodyBlock];
    if (this.handlerBlock !== null) refs.push(this.handlerBlock);
    if (this.finallyBlock !== null) refs.push(this.finallyBlock);
    refs.push(this.fallthroughBlock);
    return refs;
  }

  getDefs(): Value[] {
    return this.handlerParam !== null ? [this.handlerParam] : [];
  }

  rewrite(_values: Map<Value, Value>): TryTerm {
    return this;
  }

  clone(ctx: CloneContext): TryTerm {
    return new TryTerm(
      nextId(ctx),
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      this.handlerBlock === null
        ? null
        : (ctx.blockMap.get(this.handlerBlock) ?? this.handlerBlock),
      this.handlerParam === null ? null : remapPlace(ctx, this.handlerParam),
      this.finallyBlock === null
        ? null
        : (ctx.blockMap.get(this.finallyBlock) ?? this.finallyBlock),
      ctx.blockMap.get(this.fallthroughBlock) ?? this.fallthroughBlock,
    );
  }
}

// ---------------------------------------------------------------------
// SwitchTerm — `switch (disc) { case a: ... default: ... }`
// ---------------------------------------------------------------------

/**
 * Multi-way branch on an arbitrary value.
 *
 * Each case is `(test, block)`: control transfers to `block` when
 * `disc === test`. `defaultBlock` handles the `default:` clause (or
 * the implicit fall-to-fallthrough when absent — in which case the
 * frontend synthesizes one that jumps directly to `fallthroughBlock`).
 * `fallthroughBlock` is where control lands after a `break` or after
 * executing a case's full body.
 *
 * Source-level fall-through (case A falls into case B when no
 * `break`) is realized in the CFG by case A's block branching to
 * case B's block.
 */
export interface SwitchCase {
  readonly test: Value;
  readonly block: BasicBlock;
}

export class SwitchTerm extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public readonly discriminant: Value,
    public cases: readonly SwitchCase[],
    public defaultBlock: BasicBlock,
    public fallthroughBlock: BasicBlock,
    public readonly label?: string,
  ) {
    super(id, []);
  }

  getOperands(): Value[] {
    return [this.discriminant, ...this.cases.map((c) => c.test)];
  }

  getBlockRefs(): BasicBlock[] {
    return [...this.cases.map((c) => c.block), this.defaultBlock, this.fallthroughBlock];
  }

  rewrite(values: Map<Value, Value>): SwitchTerm {
    const newDisc = values.get(this.discriminant) ?? this.discriminant;
    let changed = newDisc !== this.discriminant;
    const newCases = this.cases.map((c) => {
      const newTest = values.get(c.test) ?? c.test;
      if (newTest !== c.test) changed = true;
      return { test: newTest, block: c.block };
    });
    if (!changed) return this;
    return new SwitchTerm(
      this.id,
      newDisc,
      newCases,
      this.defaultBlock,
      this.fallthroughBlock,
      this.label,
    );
  }

  clone(ctx: CloneContext): SwitchTerm {
    return new SwitchTerm(
      nextId(ctx),
      remapPlace(ctx, this.discriminant),
      this.cases.map((c) => ({
        test: remapPlace(ctx, c.test),
        block: ctx.blockMap.get(c.block) ?? c.block,
      })),
      ctx.blockMap.get(this.defaultBlock) ?? this.defaultBlock,
      ctx.blockMap.get(this.fallthroughBlock) ?? this.fallthroughBlock,
      this.label,
    );
  }
}

// ---------------------------------------------------------------------
// LabeledTerm — `label: statement`
// ---------------------------------------------------------------------

/**
 * Labeled block entry. Supports labeled `break` / `continue` across
 * nested constructs.
 *
 *   label: { body } fallthrough
 *
 * Control enters `bodyBlock`. A `BreakOp` with `target = this label`
 * jumps to `fallthroughBlock`; a `ContinueOp` with `target = this
 * label` jumps back to this terminator (rare — typically continue
 * is handled by inner loops, not labeled blocks).
 */
export class LabeledTerm extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public bodyBlock: BasicBlock,
    public fallthroughBlock: BasicBlock,
    public readonly label: string,
  ) {
    super(id, []);
  }

  getOperands(): Value[] {
    return [];
  }

  getBlockRefs(): BasicBlock[] {
    return [this.bodyBlock, this.fallthroughBlock];
  }

  rewrite(_values: Map<Value, Value>): LabeledTerm {
    return this;
  }

  clone(ctx: CloneContext): LabeledTerm {
    return new LabeledTerm(
      nextId(ctx),
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      ctx.blockMap.get(this.fallthroughBlock) ?? this.fallthroughBlock,
      this.label,
    );
  }
}
