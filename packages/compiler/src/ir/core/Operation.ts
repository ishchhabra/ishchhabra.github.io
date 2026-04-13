import type { Environment } from "../../environment";
import type { BasicBlock, BlockId } from "./Block";
import type { Identifier } from "./Identifier";
import type { ModuleIR } from "./ModuleIR";
import type { Place } from "./Place";
import { Region } from "./Region";

// ---------------------------------------------------------------------
// OperationId — opaque numeric id every op carries
// ---------------------------------------------------------------------

/**
 * Stable numeric id for every {@link Operation}. Opaque (nominal)
 * type so normal numbers can't be passed where an id is required.
 */
const opaqueOperationId = Symbol();
export type OperationId = number & { [opaqueOperationId]: "OperationId" };

export function makeOperationId(id: number): OperationId {
  return id as OperationId;
}

// ---------------------------------------------------------------------
// Traits
// ---------------------------------------------------------------------

/**
 * Compile-time properties of an {@link Operation} class. Traits
 * replace the old three-way class split that used to exist in this
 * codebase — concrete ops used to be grouped by `extends` into
 * `BaseInstruction` / `BaseTerminal` / `BaseStructure` hierarchies.
 *
 * Now everything extends `Operation` directly, and categorization
 * happens via `static override readonly traits = new Set([Trait.X])`
 * on each class, queried at runtime with {@link Operation.hasTrait}.
 */
export const enum Trait {
  /** Must appear as the last op in its block (branches, returns, throws). */
  Terminator = "Terminator",
  /** No observable side effects. */
  Pure = "Pure",
  /** Introduces a new lexical scope. */
  IntroducesScope = "IntroducesScope",
  /** Owns one or more nested regions (structured control flow). */
  HasRegions = "HasRegions",
}

// ---------------------------------------------------------------------
// CloneContext — unified clone argument
// ---------------------------------------------------------------------

/**
 * Per-clone state threaded through every op's `clone(ctx)` call.
 *
 * Under the old hierarchy there were three different clone signatures:
 *
 *   - instruction-shaped: `clone(moduleIR)`
 *   - terminator-shaped:  `clone(env, blockMap, identifierMap)`
 *   - structure-shaped:   `clone(blockMap, identifierMap)`
 *
 * `CloneContext` unifies those into a single bag passed as the only
 * argument. Each concrete op pulls whatever fields it needs:
 *
 *   - `moduleIR` — target module. Used for allocating fresh
 *     {@link OperationId}s (`nextId(ctx)`) and for cloning nested
 *     function bodies (`this.functionIR.clone(ctx.moduleIR)`).
 *   - `blockMap` — old → new {@link BlockId} remap. Terminators and
 *     structured CF ops use this to rewire their block references
 *     when the whole CFG is being deep-cloned.
 *   - `identifierMap` — old {@link Identifier} → new {@link Place}
 *     remap. Used to rewire operand places after phase 1 of the
 *     two-phase `FunctionIR.clone()` protocol has allocated fresh
 *     places for every def.
 *
 * For a single-op clone with no cross-block remapping (the common
 * case inside a pass), use {@link makeCloneContext} to build one with
 * empty maps.
 */
export interface CloneContext {
  readonly moduleIR: ModuleIR;
  readonly blockMap: Map<BlockId, BlockId>;
  readonly identifierMap: Map<Identifier, Place>;
}

export function makeCloneContext(moduleIR: ModuleIR): CloneContext {
  return {
    moduleIR,
    blockMap: new Map(),
    identifierMap: new Map(),
  };
}

export function remapBlockId(ctx: CloneContext, id: BlockId): BlockId {
  return ctx.blockMap.get(id) ?? id;
}

export function remapPlace(ctx: CloneContext, place: Place): Place {
  return ctx.identifierMap.get(place.identifier) ?? place;
}

/** Allocate a fresh {@link OperationId} from the clone context's module. */
export function nextId(ctx: CloneContext): OperationId {
  return makeOperationId(ctx.moduleIR.environment.nextOperationId++);
}

/**
 * Remap a {@link Region} through a {@link CloneContext}: each block in
 * the region is resolved through `ctx.blockMap` and the corresponding
 * new {@link BasicBlock} instance is fetched from the target module's
 * environment. Returns a fresh Region; the original is untouched.
 *
 * Used by structured-CF op clones (ForOfOp, ForInOp, BlockOp,
 * LabeledBlockOp, TernaryOp) to preserve region ownership when their
 * owning function is deep-cloned.
 */
export function remapRegion(ctx: CloneContext, region: Region): Region {
  const newBlocks: BasicBlock[] = [];
  for (const oldBlock of region.blocks) {
    const newBlockId = ctx.blockMap.get(oldBlock.id) ?? oldBlock.id;
    const newBlock = ctx.moduleIR.environment.blocks.get(newBlockId);
    if (newBlock === undefined) {
      throw new Error(`remapRegion: block bb${newBlockId} not found in environment`);
    }
    newBlocks.push(newBlock);
  }
  return new Region(newBlocks);
}

// ---------------------------------------------------------------------
// Operation — the one base class for every IR node
// ---------------------------------------------------------------------

/**
 * Base class for every IR node. Instructions, terminators, and
 * structured control-flow ops all extend this directly. There is no
 * intermediate hierarchy.
 *
 * What Operation provides:
 *
 *   - `id: OperationId` — every op has a stable id.
 *   - `place?: Place` — primary SSA result for ops that produce a
 *     value. Terminators and structures leave it undefined;
 *     instructions narrow via `public override readonly place: Place`
 *     in their constructors.
 *   - Static `traits` + `hasTrait(t)` for compile-time categorization.
 *   - Abstract `getOperands()`, `rewrite()`, `clone(ctx)`.
 *   - Sensible defaults for `getDefs()`, `hasSideEffects()`,
 *     `isDeterministic`, `isPure()`, `getBlockRefs()`, `getJoinTarget()`,
 *     `remap()`, `print()`, `toString()`.
 *
 * Concrete ops override only what they need.
 */
export abstract class Operation {
  /** Stable numeric id. Every Operation has one. */
  public readonly id: OperationId;

  /**
   * Primary result place. Undefined for terminators and structures.
   * Instruction subclasses narrow this to `Place` via
   * `public override readonly place: Place` in their constructor
   * parameter shorthand.
   */
  public readonly place: Place | undefined = undefined;

  /**
   * Regions owned by this op. Most ops have none. Structured
   * control-flow ops carry their nested CFGs here. Set once at
   * construction and (after the transition) never mutated in-place;
   * passes that need to rewrite a region build a new op with the
   * replacement regions.
   */
  public readonly regions: readonly Region[];

  static readonly traits: ReadonlySet<Trait> = new Set();

  constructor(id: OperationId, regions: readonly Region[] = []) {
    this.id = id;
    this.regions = regions;
    for (const region of regions) {
      // Back-pointer so a walker starting from any block can reach
      // its enclosing op without a side map.
      (region as { parent: Operation | null }).parent = this;
    }
  }

  hasTrait(t: Trait): boolean {
    return (this.constructor as typeof Operation).traits.has(t);
  }

  // -----------------------------------------------------------------
  // Operand / def interface
  // -----------------------------------------------------------------

  abstract getOperands(): Place[];

  /**
   * Places this op writes. Default: `[place]` if the op has a place,
   * empty otherwise. Multi-def ops (StoreLocal, destructure) override.
   */
  getDefs(): Place[] {
    return this.place !== undefined ? [this.place] : [];
  }

  /** MLIR-style alias for {@link getDefs}. */
  get results(): readonly Place[] {
    return this.getDefs();
  }

  getUses(): Place[] {
    return this.getOperands();
  }

  // -----------------------------------------------------------------
  // Cloning and rewriting — one unified signature
  // -----------------------------------------------------------------

  abstract clone(ctx: CloneContext): Operation;

  /**
   * Operand-substituting rewrite. Returns either `this` (no change) or
   * a fresh op with rewritten operands.
   *
   * Per-op rewrites (the common case) accept the
   * `{ rewriteDefinitions?: boolean }` option to also rewrite
   * definition sites. Function-level `FunctionIR.rewrite` overrides
   * with a different option shape (`{ skipBlock?, skipInstructionIndex? }`)
   * because it walks every block in place, not a single op — so the
   * options parameter here is intentionally typed as `object` to
   * accommodate both shapes. Concrete ops narrow it via their override.
   */
  abstract rewrite(values: Map<Identifier, Place>, options?: object): Operation;

  // -----------------------------------------------------------------
  // Side effects / purity
  // -----------------------------------------------------------------

  hasSideEffects(_environment: Environment): boolean {
    return !this.hasTrait(Trait.Pure);
  }

  get isDeterministic(): boolean {
    return true;
  }

  isPure(environment: Environment): boolean {
    return !this.hasSideEffects(environment) && this.isDeterministic;
  }

  // -----------------------------------------------------------------
  // Terminator helpers (default empty for non-terminators)
  // -----------------------------------------------------------------

  getBlockRefs(): BlockId[] {
    return [];
  }

  getJoinTarget(): BlockId | null {
    return null;
  }

  remap(_from: BlockId, _to: BlockId): void {
    // no-op
  }

  // -----------------------------------------------------------------
  // Verification — each op can assert its structural invariants.
  // Called by pass infrastructure at pass boundaries (in debug
  // builds) and unconditionally at the end of the pipeline. Throws
  // {@link VerifyError} with a descriptive message on failure.
  //
  // The default implementation checks that:
  //   - every operand is a non-null Place.
  //   - every def is a non-null Place.
  //   - the op's own `place`, if declared, appears in `getDefs()`.
  //
  // Concrete ops override to add op-specific invariants (e.g.
  // `BranchOp` asserts 3 distinct block refs, `PhiOp` asserts at
  // least 2 operands, etc.).
  // -----------------------------------------------------------------

  verify(): void {
    for (const operand of this.getOperands()) {
      if (operand == null || operand.identifier == null) {
        throw new VerifyError(this, "has null operand");
      }
    }
    for (const def of this.getDefs()) {
      if (def == null || def.identifier == null) {
        throw new VerifyError(this, "has null def");
      }
    }
    if (this.place !== undefined) {
      const defs = this.getDefs();
      if (defs.length === 0 || defs[0] !== this.place) {
        // Not an error by default — multi-def ops (StoreLocal,
        // destructure) legally include `place` at a non-first index
        // or omit it when the primary result is a binding rather
        // than a value. We only require that `place` be in the list
        // if it's declared at all.
        if (!defs.includes(this.place)) {
          throw new VerifyError(this, `place ${this.place.print()} is not in getDefs()`);
        }
      }
    }
  }

  // -----------------------------------------------------------------
  // Debug
  // -----------------------------------------------------------------

  print(): string {
    const prefix = this.place ? `${this.place.print()} = ` : "";
    return `${prefix}${this.constructor.name}`;
  }

  toString(): string {
    return this.print();
  }
}

/**
 * Thrown by `Operation.verify()` (and {@link verifyFunction}) when a
 * structural invariant is violated. Carries the offending op for
 * debugging context.
 */
export class VerifyError extends Error {
  constructor(
    public readonly op: Operation,
    public readonly reason: string,
  ) {
    super(`IR verify: ${op.constructor.name}#${op.id}: ${reason}`);
    this.name = "VerifyError";
  }
}
