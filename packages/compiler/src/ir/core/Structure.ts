import { BlockId } from "./Block";
import { Identifier } from "./Identifier";
import { Place } from "./Place";

/**
 * Base class for all structures. Structures represent structured control flow
 * constructs that group multiple CFG blocks into a single semantic unit.
 *
 * Structures are the primary representation for JS constructs that span
 * multiple blocks. They carry semantic data (e.g., loop variable, iterable)
 * and define the CFG edges between their regions. Generic terminals
 * (Jump, Return, Throw) handle control flow within regions.
 */
export abstract class BaseStructure {
  /** Returns CFG edges defined by this structure as [source, target] pairs. */
  abstract getEdges(): Array<[BlockId, BlockId]>;

  /** Returns all block IDs referenced by this structure. */
  abstract getBlockRefs(): BlockId[];

  /** Returns places read by this structure (used by DCE to track liveness). */
  abstract getReadPlaces(): Place[];

  /** Returns places written by this structure. */
  abstract getWrittenPlaces(): Place[];

  /** Returns a new structure with places rewritten per the given map (used by SSA renaming). */
  abstract rewrite(values: Map<Identifier, Place>): BaseStructure;

  /** Replaces block references to `from` with `to` in place. */
  abstract remap(from: BlockId, to: BlockId): void;

  /**
   * Whether this structure has observable side effects. Side-effectful
   * structures (e.g. loops that run user code) are always live even if
   * their written places are unused. Pure structures (e.g. ternary
   * expressions) can be eliminated when their result is unused.
   */
  hasSideEffects(): boolean {
    return true;
  }
}

/**
 * A structure that represents a for...in loop.
 */
export class ForInStructure extends BaseStructure {
  constructor(
    public header: BlockId,
    public readonly iterationValue: Place,
    public readonly object: Place,
    public body: BlockId,
    public fallthrough: BlockId,
    public readonly label?: string,
  ) {
    super();
  }

  getEdges(): Array<[BlockId, BlockId]> {
    return [
      [this.header, this.body],
      [this.header, this.fallthrough],
    ];
  }

  getBlockRefs(): BlockId[] {
    return [this.body, this.fallthrough];
  }

  getReadPlaces(): Place[] {
    return [this.object];
  }

  getWrittenPlaces(): Place[] {
    return [this.iterationValue];
  }

  rewrite(values: Map<Identifier, Place>): ForInStructure {
    const iterationValue = this.iterationValue.rewrite(values);
    const object = this.object.rewrite(values);
    if (iterationValue === this.iterationValue && object === this.object) {
      return this;
    }

    return new ForInStructure(
      this.header,
      iterationValue,
      object,
      this.body,
      this.fallthrough,
      this.label,
    );
  }

  remap(from: BlockId, to: BlockId): void {
    if (this.header === from) this.header = to;
    if (this.body === from) this.body = to;
    if (this.fallthrough === from) this.fallthrough = to;
  }
}

/**
 * A structure that represents a for...of loop.
 */
export class ForOfStructure extends BaseStructure {
  constructor(
    public header: BlockId,
    public readonly iterationValue: Place,
    public readonly iterable: Place,
    public body: BlockId,
    public fallthrough: BlockId,
    public readonly isAwait: boolean,
    public readonly label?: string,
  ) {
    super();
  }

  getEdges(): Array<[BlockId, BlockId]> {
    return [
      [this.header, this.body],
      [this.header, this.fallthrough],
    ];
  }

  getBlockRefs(): BlockId[] {
    return [this.body, this.fallthrough];
  }

  getReadPlaces(): Place[] {
    return [this.iterable];
  }

  getWrittenPlaces(): Place[] {
    return [this.iterationValue];
  }

  rewrite(values: Map<Identifier, Place>): ForOfStructure {
    const iterationValue = this.iterationValue.rewrite(values);
    const iterable = this.iterable.rewrite(values);
    if (iterationValue === this.iterationValue && iterable === this.iterable) {
      return this;
    }

    return new ForOfStructure(
      this.header,
      iterationValue,
      iterable,
      this.body,
      this.fallthrough,
      this.isAwait,
      this.label,
    );
  }

  remap(from: BlockId, to: BlockId): void {
    if (this.header === from) this.header = to;
    if (this.body === from) this.body = to;
    if (this.fallthrough === from) this.fallthrough = to;
  }
}

/**
 * A structure that represents a conditional (ternary) expression.
 *
 * Keeps the consequent and alternate as blocks so branch instructions
 * stay in their arms — no hoisting required, and side effects remain
 * guarded by the condition.
 *
 * The codegen emits this as `test ? (consequent block as expr) : (alternate block as expr)`.
 */
export class TernaryStructure extends BaseStructure {
  constructor(
    /** The block that owns this structure (contains the test + the ternary). */
    public header: BlockId,
    /** The condition expression place. */
    public readonly test: Place,
    /** Block containing the consequent arm instructions. */
    public consequent: BlockId,
    /** The Place produced by the consequent arm (the ternary's "true" value). */
    public readonly consequentValue: Place,
    /** Block containing the alternate arm instructions. */
    public alternate: BlockId,
    /** The Place produced by the alternate arm (the ternary's "false" value). */
    public readonly alternateValue: Place,
    /** The block after the ternary (merge point). */
    public fallthrough: BlockId,
    /** The Place where the ternary result is registered in the codegen. */
    public readonly resultPlace: Place,
  ) {
    super();
  }

  getEdges(): Array<[BlockId, BlockId]> {
    return [
      [this.header, this.consequent],
      [this.header, this.alternate],
      [this.header, this.fallthrough],
    ];
  }

  getBlockRefs(): BlockId[] {
    return [this.consequent, this.alternate, this.fallthrough];
  }

  getReadPlaces(): Place[] {
    return [this.test, this.consequentValue, this.alternateValue];
  }

  getWrittenPlaces(): Place[] {
    return [this.resultPlace];
  }

  override hasSideEffects(): boolean {
    return false;
  }

  rewrite(values: Map<Identifier, Place>): TernaryStructure {
    const test = this.test.rewrite(values);
    const consequentValue = this.consequentValue.rewrite(values);
    const alternateValue = this.alternateValue.rewrite(values);
    const resultPlace = this.resultPlace.rewrite(values);
    if (
      test === this.test &&
      consequentValue === this.consequentValue &&
      alternateValue === this.alternateValue &&
      resultPlace === this.resultPlace
    ) {
      return this;
    }

    return new TernaryStructure(
      this.header,
      test,
      this.consequent,
      consequentValue,
      this.alternate,
      alternateValue,
      this.fallthrough,
      resultPlace,
    );
  }

  remap(from: BlockId, to: BlockId): void {
    if (this.header === from) this.header = to;
    if (this.consequent === from) this.consequent = to;
    if (this.alternate === from) this.alternate = to;
    if (this.fallthrough === from) this.fallthrough = to;
  }
}

/**
 * A structure that represents a labeled block statement.
 *
 * Labeled blocks allow `break label` to exit the block early.
 * The structure wraps the block body and provides a fallthrough
 * (exit) block that `break label` targets.
 */
export class LabeledBlockStructure extends BaseStructure {
  constructor(
    public header: BlockId,
    public body: BlockId,
    public fallthrough: BlockId,
    public readonly label: string,
  ) {
    super();
  }

  getEdges(): Array<[BlockId, BlockId]> {
    return [
      [this.header, this.body],
      [this.header, this.fallthrough],
    ];
  }

  getBlockRefs(): BlockId[] {
    return [this.body, this.fallthrough];
  }

  getReadPlaces(): Place[] {
    return [];
  }

  getWrittenPlaces(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): LabeledBlockStructure {
    return this;
  }

  remap(from: BlockId, to: BlockId): void {
    if (this.header === from) this.header = to;
    if (this.body === from) this.body = to;
    if (this.fallthrough === from) this.fallthrough = to;
  }
}
