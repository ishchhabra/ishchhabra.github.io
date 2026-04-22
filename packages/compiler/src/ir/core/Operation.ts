import type { Environment } from "../../environment";
import type { BasicBlock, BlockId } from "./Block";
import type { MemoryEffects } from "../memory/MemoryLocation";
import { NoEffects } from "../memory/MemoryLocation";
import type { ModuleIR } from "./ModuleIR";
import type { Value } from "./Value";
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
 *   - terminator-shaped:  `clone(env, blockMap, valueMap)`
 *   - structure-shaped:   `clone(blockMap, valueMap)`
 *
 * `CloneContext` unifies those into a single bag passed as the only
 * argument. Each concrete op pulls whatever fields it needs:
 *
 *   - `moduleIR` — target module. Used for allocating fresh
 *     {@link OperationId}s (`nextId(ctx)`) and for cloning nested
 *     function bodies (`this.funcOp.clone(ctx.moduleIR)`).
 *   - `blockMap` — old → new {@link BlockId} remap. Terminators and
 *     structured CF ops use this to rewire their block references
 *     when the whole CFG is being deep-cloned.
 *   - `valueMap` — old {@link Value} → new {@link Value}
 *     remap. Used to rewire operand places after phase 1 of the
 *     two-phase `FuncOp.clone()` protocol has allocated fresh
 *     places for every def.
 *
 * For a single-op clone with no cross-block remapping (the common
 * case inside a pass), use {@link makeCloneContext} to build one with
 * empty maps.
 */
export interface CloneContext {
  /**
   * Target environment. Always present. Source of fresh ids and
   * value/block lookups. Ops that only need id allocation or value
   * lookup should prefer this over {@link moduleIR}.
   */
  readonly environment: Environment;
  /**
   * Target module. Present for module-scoped clones (e.g. cloning a
   * function body into another module); absent for the within-block
   * rewrite path used by {@link BasicBlock.rewrite}.
   */
  readonly moduleIR: ModuleIR | undefined;
  readonly blockMap: Map<BasicBlock, BasicBlock>;
  /**
   * Old → new {@link Value} remap, used to rewire operands after
   * phase 1 of a deep clone has allocated fresh values for every def.
   * (Historically named `valueMap` from the pre-merge era where
   * {@link Value} was split into `Value` + `Value`.)
   */
  readonly valueMap: Map<Value, Value>;
}

export function makeCloneContext(moduleIR: ModuleIR): CloneContext {
  return {
    environment: moduleIR.environment,
    moduleIR,
    blockMap: new Map(),
    valueMap: new Map(),
  };
}

export function remapBlock(ctx: CloneContext, block: BasicBlock): BasicBlock {
  return ctx.blockMap.get(block) ?? block;
}

export function remapPlace(ctx: CloneContext, place: Value): Value {
  return ctx.valueMap.get(place) ?? place;
}

/** Allocate a fresh {@link OperationId} from the clone context's module. */
export function nextId(ctx: CloneContext): OperationId {
  return makeOperationId(ctx.environment.nextOperationId++);
}

/**
 * Fetch `ctx.moduleIR`, throwing if it's `undefined`. Used by op
 * `clone()` methods that need to recurse into nested function bodies
 * (`this.funcOp.clone(makeCloneContext(moduleIR))`) — a full
 * module-scoped clone is required for that, not just an environment.
 *
 * Callers using `ctx.environment` for id/value allocation don't need
 * this helper.
 */
export function requireModuleIR(ctx: CloneContext): ModuleIR {
  if (ctx.moduleIR === undefined) {
    throw new Error(
      "CloneContext.moduleIR is required for this clone — build the context with makeCloneContext(moduleIR).",
    );
  }
  return ctx.moduleIR;
}

/**
 * Remap a {@link Region} through a {@link CloneContext}: each block in
 * the region is resolved through `ctx.blockMap` and the corresponding
 * new {@link BasicBlock} instance is fetched from the target module's
 * environment. Returns a fresh Region; the original is untouched.
 *
 * Used by structured-CF op clones (ForOfOp, ForInOp, BlockOp,
 * LabeledBlockOp, IfOp, WhileOp) to preserve region ownership when
 * their owning function is deep-cloned.
 */
export function remapRegion(ctx: CloneContext, region: Region): Region {
  const newBlocks: BasicBlock[] = [];
  for (const oldBlock of region.blocks) {
    newBlocks.push(ctx.blockMap.get(oldBlock) ?? oldBlock);
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
 *   - `place?: Value` — primary SSA result for ops that produce a
 *     value. Terminators and structures leave it undefined;
 *     instructions narrow via `public override readonly place: Value`
 *     in their constructors.
 *   - Static `traits` + `hasTrait(t)` for compile-time categorization.
 *   - Abstract `getOperands()`, `rewrite()`, `clone(ctx)`.
 *   - Sensible defaults for `getDefs()`, `hasSideEffects()`,
 *     `isDeterministic`, `isPure()`, `getBlockRefs()`,
 *     `remap()`, `print()`, `toString()`.
 *
 * Concrete ops override only what they need.
 */
export abstract class Operation {
  /** Stable numeric id. Every Operation has one. */
  public readonly id: OperationId;

  /**
   * Primary result place. Undefined for terminators and structures.
   * Instruction subclasses narrow this to `Value` via
   * `public override readonly place: Value` in their constructor
   * parameter shorthand.
   */
  public readonly place: Value | undefined = undefined;

  /**
   * Regions owned by this op. Most ops have none. Structured
   * control-flow ops carry their nested CFGs here. Set once at
   * construction and (after the transition) never mutated in-place;
   * passes that need to rewrite a region build a new op with the
   * replacement regions.
   */
  public readonly regions: readonly Region[];

  /**
   * Back-pointer to the {@link BasicBlock} that contains this op.
   * Set by `BasicBlock` when the op is attached, cleared when
   * detached. `null` for ops that are unattached (transient
   * construction state) or for `FuncOp` itself (owned by a module,
   * not a block).
   *
   * Enables upward walks from any op — e.g. scope resolution,
   * which walks `op → owningBlock → parent region → parent op → …`
   * up to the function body region.
   */
  public parentBlock: BasicBlock | null = null;

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

  abstract getOperands(): Value[];

  /**
   * Places this op writes. Default: `[place]` if the op has a place,
   * empty otherwise. Multi-def ops (StoreLocal, destructure,
   * structured ops with `resultPlaces`) override.
   */
  getDefs(): Value[] {
    return this.place !== undefined ? [this.place] : [];
  }

  /**
   * MLIR-style: the SSA values this op produces. Canonical spelling
   * matching `mlir::Operation::getResults()`. Aliases {@link getDefs}.
   */
  getResults(): readonly Value[] {
    return this.getDefs();
  }

  /** Getter form for the same value, for call sites that read it
   *  as a property. */
  get results(): readonly Value[] {
    return this.getDefs();
  }

  getUses(): Value[] {
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
   * definition sites. Function-level `FuncOp.rewrite` overrides
   * with a different option shape (`{ skipBlock?, skipInstructionIndex? }`)
   * because it walks every block in place, not a single op — so the
   * options parameter here is intentionally typed as `object` to
   * accommodate both shapes. Concrete ops narrow it via their override.
   */
  abstract rewrite(values: Map<Value, Value>, options?: object): Operation;

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

  /**
   * Memory effects this op produces — the alphabet memory-aware
   * analyses speak (see {@link MemoryStateWalker}). Default: no
   * effects. Effectful ops (loads, stores, calls) override. Passes
   * that don't care about memory can ignore this entirely.
   *
   * `environment` is passed so ops that need module-scope context
   * (e.g. `CallExpressionOp` consulting the builtin table for
   * purity) can resolve it; most overrides ignore it.
   */
  getMemoryEffects(_environment?: Environment): MemoryEffects {
    return NoEffects;
  }

  // -----------------------------------------------------------------
  // Terminator helpers (default empty for non-terminators)
  // -----------------------------------------------------------------

  getBlockRefs(): BasicBlock[] {
    return [];
  }

  remap(_from: BasicBlock, _to: BasicBlock): void {
    // no-op
  }

  // -----------------------------------------------------------------
  // Verification — each op can assert its structural invariants.
  // Called by pass infrastructure at pass boundaries (in debug
  // builds) and unconditionally at the end of the pipeline. Throws
  // {@link VerifyError} with a descriptive message on failure.
  //
  // The default implementation checks that:
  //   - every operand is a non-null Value.
  //   - every def is a non-null Value.
  //   - the op's own `place`, if declared, appears in `getDefs()`.
  //
  // Concrete ops override to add op-specific invariants.
  // -----------------------------------------------------------------

  verify(): void {
    for (const operand of this.getOperands()) {
      if (operand == null) {
        throw new VerifyError(this, "has null operand");
      }
    }
    for (const def of this.getDefs()) {
      if (def == null) {
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

    // Use-chain consistency: every operand lists `this` as a user.
    // Skipped for unattached ops — `registerUses` runs on append.
    if (this.parentBlock !== null) {
      for (const operand of this.getOperands()) {
        if (!operand.uses.has(this)) {
          throw new VerifyError(this, `operand ${operand.print()} does not list this as a user`);
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
