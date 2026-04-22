import type { OperationId } from "../../core";
import {
  type DestructureTarget,
  getDestructureTargetDefs,
  getDestructureTargetOperands,
  rewriteDestructureTarget,
} from "../../core/Destructure";
import type { Value } from "../../core/Value";
import {
  type CloneContext,
  nextId,
  Operation,
  remapPlace,
  remapRegion,
  Trait,
  VerifyError,
} from "../../core/Operation";
import { Region } from "../../core/Region";
import { registerUses, unregisterUses } from "../../core/Use";
import {
  parentExit,
  type RegionBranchOp,
  type RegionBranchPoint,
  type RegionSuccessor,
} from "../../core/RegionBranchOp";
import type { LoopLikeOpInterface } from "../../core/LoopLikeOpInterface";

/**
 * `for (key in object) { body }`.
 *
 * Inline structured op — lives directly in its parent block, owns
 * a single body region, no fallthrough field.
 */
export class ForInOp extends Operation implements RegionBranchOp, LoopLikeOpInterface {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  /** Mutable — MLIR-style. */
  public resultPlaces: Value[];
  /** Mutable — MLIR-style. Use {@link setInits}. */
  public inits: Value[];

  constructor(
    id: OperationId,
    public readonly iterationValue: Value,
    public readonly iterationTarget: DestructureTarget,
    public readonly object: Value,
    bodyRegion: Region,
    public readonly label?: string,
    resultPlaces: readonly Value[] = [],
    inits: readonly Value[] = [],
  ) {
    bodyRegion.scopeKind = "for";
    super(id, [bodyRegion]);
    this.resultPlaces = [...resultPlaces];
    this.inits = [...inits];
  }

  setInits(inits: readonly Value[]): void {
    if (this.parentBlock !== null) unregisterUses(this);
    this.inits = [...inits];
    if (this.parentBlock !== null) registerUses(this);
  }

  setResultPlaces(places: readonly Value[]): void {
    this.resultPlaces = [...places];
  }

  get bodyRegion(): Region {
    return this.regions[0];
  }

  getOperands(): Value[] {
    // `inits` carry the SSA iter-arg seeds into the body region's
    // entry block params; must be declared as operands so
    // `registerUses` records the def-use edges. See the matching
    // note in `ForOfOp`.
    return [...this.inits, ...getDestructureTargetOperands(this.iterationTarget), this.object];
  }

  override getDefs(): Value[] {
    return [
      this.iterationValue,
      ...getDestructureTargetDefs(this.iterationTarget),
      ...this.resultPlaces,
    ];
  }

  rewrite(values: Map<Value, Value>): ForInOp {
    const iterationValue = this.iterationValue.rewrite(values);
    const iterationTarget = rewriteDestructureTarget(this.iterationTarget, values, {
      rewriteDefinitions: true,
    });
    const object = this.object.rewrite(values);
    if (
      iterationValue === this.iterationValue &&
      iterationTarget === this.iterationTarget &&
      object === this.object
    ) {
      return this;
    }

    return new ForInOp(
      this.id,
      iterationValue,
      iterationTarget,
      object,
      this.regions[0],
      this.label,
      this.resultPlaces,
      this.inits,
    );
  }

  clone(ctx: CloneContext): ForInOp {
    return new ForInOp(
      nextId(ctx),
      remapPlace(ctx, this.iterationValue),
      rewriteDestructureTarget(this.iterationTarget, ctx.valueMap, {
        rewriteDefinitions: true,
      }),
      remapPlace(ctx, this.object),
      remapRegion(ctx, this.regions[0]),
      this.label,
      this.resultPlaces.map((p) => remapPlace(ctx, p)),
      this.inits.map((p) => remapPlace(ctx, p)),
    );
  }

  override verify(): void {
    super.verify();
    if (this.regions.length !== 1) {
      throw new VerifyError(this, `expected 1 region, got ${this.regions.length}`);
    }
  }

  // ------------------------------------------------------------------
  // RegionBranchOp — single-region iterator-driven loop
  // ------------------------------------------------------------------

  getSuccessorRegions(point: RegionBranchPoint): readonly RegionSuccessor[] {
    if (point.kind === "parent") {
      // Enter the loop → body entry. `inits` feed body's block params
      // on the first iteration.
      return [{ target: this.bodyRegion }];
    }
    if (point.region === this.bodyRegion) {
      // Body's natural YieldOp is simultaneously the back-edge (next
      // iteration bindings) and — on iterator exhaustion — the exit
      // (values become the op's resultPlaces). Both successors
      // receive the same forwarded operands.
      return [{ target: this.bodyRegion }, { target: parentExit }];
    }
    return [];
  }

  getEntrySuccessorOperands(_successor: RegionSuccessor): readonly Value[] {
    return this.inits;
  }

  // LoopLikeOpInterface ------------------------------------------------

  getLoopRegions(): readonly Region[] {
    return [this.bodyRegion];
  }

  getInitsMutable(): readonly Value[] {
    return this.inits;
  }

  getYieldedValuesMutable(): readonly Value[] | undefined {
    // Body region terminates in `YieldOp` routing to either
    // bodyRegion (next iteration) or parent-exit. Single yield slot.
    const lastBlock = this.bodyRegion.blocks[this.bodyRegion.blocks.length - 1];
    const terminal = lastBlock?.terminal;
    if (terminal === undefined) return undefined;
    // Can't type-narrow here without importing YieldOp; the SSA
    // builder accesses terminators directly. This accessor is for
    // future LICM-style passes — return undefined for now.
    return undefined;
  }
}
