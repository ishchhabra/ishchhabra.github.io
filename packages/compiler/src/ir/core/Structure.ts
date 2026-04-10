import { BlockId } from "./Block";
import {
  type DestructureTarget,
  getDestructureTargetDefs,
  getDestructureTargetOperands,
  rewriteDestructureTarget,
} from "./Destructure";
import { Identifier } from "./Identifier";
import { Place } from "./Place";

function remapBlock(blockMap: Map<BlockId, BlockId>, blockId: BlockId): BlockId {
  return blockMap.get(blockId) ?? blockId;
}

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

  /** Returns places this structure uses (operands / inputs). */
  abstract getOperands(): Place[];

  /** Returns places this structure defines (outputs). */
  abstract getDefs(): Place[];

  /** Returns a new structure with places rewritten per the given map (used by SSA renaming). */
  abstract rewrite(values: Map<Identifier, Place>): BaseStructure;

  /**
   * Deep clone the structure with block refs remapped through `blockMap`
   * and places rewritten through `identifierMap`.
   */
  abstract clone(
    blockMap: Map<BlockId, BlockId>,
    identifierMap: Map<Identifier, Place>,
  ): BaseStructure;

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
 * A structure that represents a standalone source-level block statement.
 */
export class BlockStructure extends BaseStructure {
  constructor(
    public header: BlockId,
    public body: BlockId,
    public exit: BlockId,
  ) {
    super();
  }

  getEdges(): Array<[BlockId, BlockId]> {
    return [[this.header, this.body]];
  }

  getBlockRefs(): BlockId[] {
    return [this.body, this.exit];
  }

  getOperands(): Place[] {
    return [];
  }

  getDefs(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): BlockStructure {
    return this;
  }

  clone(blockMap: Map<BlockId, BlockId>, _identifierMap: Map<Identifier, Place>): BlockStructure {
    return new BlockStructure(
      remapBlock(blockMap, this.header),
      remapBlock(blockMap, this.body),
      remapBlock(blockMap, this.exit),
    );
  }

  remap(from: BlockId, to: BlockId): void {
    if (this.header === from) this.header = to;
    if (this.body === from) this.body = to;
    if (this.exit === from) this.exit = to;
  }
}

/**
 * A structure that represents a for...in loop.
 */
export class ForInStructure extends BaseStructure {
  constructor(
    public header: BlockId,
    public readonly iterationValue: Place,
    public readonly iterationTarget: DestructureTarget,
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

  getOperands(): Place[] {
    return [...getDestructureTargetOperands(this.iterationTarget), this.object];
  }

  getDefs(): Place[] {
    return [this.iterationValue, ...getDestructureTargetDefs(this.iterationTarget)];
  }

  rewrite(values: Map<Identifier, Place>): ForInStructure {
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

    return new ForInStructure(
      this.header,
      iterationValue,
      iterationTarget,
      object,
      this.body,
      this.fallthrough,
      this.label,
    );
  }

  clone(blockMap: Map<BlockId, BlockId>, identifierMap: Map<Identifier, Place>): ForInStructure {
    return new ForInStructure(
      remapBlock(blockMap, this.header),
      identifierMap.get(this.iterationValue.identifier) ?? this.iterationValue,
      rewriteDestructureTarget(this.iterationTarget, identifierMap, { rewriteDefinitions: true }),
      identifierMap.get(this.object.identifier) ?? this.object,
      remapBlock(blockMap, this.body),
      remapBlock(blockMap, this.fallthrough),
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
    public readonly iterationTarget: DestructureTarget,
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

  getOperands(): Place[] {
    return [...getDestructureTargetOperands(this.iterationTarget), this.iterable];
  }

  getDefs(): Place[] {
    return [this.iterationValue, ...getDestructureTargetDefs(this.iterationTarget)];
  }

  rewrite(values: Map<Identifier, Place>): ForOfStructure {
    const iterationValue = this.iterationValue.rewrite(values);
    const iterationTarget = rewriteDestructureTarget(this.iterationTarget, values, {
      rewriteDefinitions: true,
    });
    const iterable = this.iterable.rewrite(values);
    if (
      iterationValue === this.iterationValue &&
      iterationTarget === this.iterationTarget &&
      iterable === this.iterable
    ) {
      return this;
    }

    return new ForOfStructure(
      this.header,
      iterationValue,
      iterationTarget,
      iterable,
      this.body,
      this.fallthrough,
      this.isAwait,
      this.label,
    );
  }

  clone(blockMap: Map<BlockId, BlockId>, identifierMap: Map<Identifier, Place>): ForOfStructure {
    return new ForOfStructure(
      remapBlock(blockMap, this.header),
      identifierMap.get(this.iterationValue.identifier) ?? this.iterationValue,
      rewriteDestructureTarget(this.iterationTarget, identifierMap, { rewriteDefinitions: true }),
      identifierMap.get(this.iterable.identifier) ?? this.iterable,
      remapBlock(blockMap, this.body),
      remapBlock(blockMap, this.fallthrough),
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

  getOperands(): Place[] {
    return [this.test, this.consequentValue, this.alternateValue];
  }

  getDefs(): Place[] {
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

  clone(blockMap: Map<BlockId, BlockId>, identifierMap: Map<Identifier, Place>): TernaryStructure {
    return new TernaryStructure(
      remapBlock(blockMap, this.header),
      identifierMap.get(this.test.identifier) ?? this.test,
      remapBlock(blockMap, this.consequent),
      identifierMap.get(this.consequentValue.identifier) ?? this.consequentValue,
      remapBlock(blockMap, this.alternate),
      identifierMap.get(this.alternateValue.identifier) ?? this.alternateValue,
      remapBlock(blockMap, this.fallthrough),
      identifierMap.get(this.resultPlace.identifier) ?? this.resultPlace,
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

  getOperands(): Place[] {
    return [];
  }

  getDefs(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): LabeledBlockStructure {
    return this;
  }

  clone(
    blockMap: Map<BlockId, BlockId>,
    _identifierMap: Map<Identifier, Place>,
  ): LabeledBlockStructure {
    return new LabeledBlockStructure(
      remapBlock(blockMap, this.header),
      remapBlock(blockMap, this.body),
      remapBlock(blockMap, this.fallthrough),
      this.label,
    );
  }

  remap(from: BlockId, to: BlockId): void {
    if (this.header === from) this.header = to;
    if (this.body === from) this.body = to;
    if (this.fallthrough === from) this.fallthrough = to;
  }
}
