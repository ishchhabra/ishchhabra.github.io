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

  /** Returns places read by this structure (used by DCE to track liveness). */
  abstract getReadPlaces(): Place[];

  /** Returns places written by this structure. */
  abstract getWrittenPlaces(): Place[];

  /** Returns a new structure with places rewritten per the given map (used by SSA renaming). */
  abstract rewrite(values: Map<Identifier, Place>): BaseStructure;
}

/**
 * A structure that represents a for...of loop.
 */
export class ForOfStructure extends BaseStructure {
  constructor(
    public readonly header: BlockId,
    public readonly iterationValue: Place,
    public readonly iterable: Place,
    public readonly body: BlockId,
    public readonly fallthrough: BlockId,
    public readonly isAwait: boolean,
  ) {
    super();
  }

  getEdges(): Array<[BlockId, BlockId]> {
    return [
      [this.header, this.body],
      [this.header, this.fallthrough],
    ];
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
    );
  }
}
