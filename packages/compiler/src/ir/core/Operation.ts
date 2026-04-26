import type { Environment } from "../../environment";
import type { MemoryEffects } from "../memory/MemoryLocation";
import { UnknownLocation } from "../memory/MemoryLocation";
import type { BasicBlock } from "./Block";
import type { ModuleIR } from "./ModuleIR";
import type { Value } from "./Value";

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
 *   - Abstract `operands()`, `rewrite()`, `clone(ctx)`.
 *   - Sensible defaults for `results()`, the five effects axes
 *     (`getMemoryEffects`, `mayThrow`, `mayDiverge`, `isDeterministic`,
 *     `isObservable`), `remap()`, `print()`, `toString()`.
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
   * Back-pointer to the {@link BasicBlock} that contains this op. Set
   * by `BasicBlock` when the op is attached, cleared when detached.
   * `null` for unattached ops (transient construction state) and for
   * `FuncOp` (owned by a module, not a block).
   */
  public parentBlock: BasicBlock | null = null;

  constructor(id: OperationId) {
    this.id = id;
  }

  // -----------------------------------------------------------------
  // Operand / def interface
  // -----------------------------------------------------------------

  /** Values consumed by this operation.
   *
   * Operands are incoming value dependencies. They represent the values
   * this operation needs in order to execute, regardless of whether those
   * values are temporaries, binding cells, block parameters, or other IR
   * values.
   */
  abstract operands(): Value[];

  /**
   * Values produced by this operation.
   *
   * Results are outgoing value definitions made available to later IR.
   * Single-result operations usually return their primary `result`; ops
   * that introduce multiple values return them in stable positional order.
   */
  results(): Value[] {
    return this.place !== undefined ? [this.place] : [];
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
  // Effects model — five orthogonal axes
  //
  // Defaults are maximally conservative. Every derived predicate
  // (see `src/ir/effects/predicates.ts`) returns `false` for an
  // un-overridden op. An op opts *into* optimization by overriding
  // axes it can prove safe.
  // -----------------------------------------------------------------

  /**
   * Memory effects this op produces — the alphabet memory-aware
   * analyses speak (see {@link MemoryStateWalker}).
   *
   * Conservative default: reads and writes `UnknownLocation`
   * (aliases everything). Concrete ops override to declare narrower
   * footprints.
   *
   * `environment` is passed so ops that need module-scope context
   * (e.g. `CallExpressionOp` consulting the builtin table) can
   * resolve it; most overrides ignore it.
   */
  getMemoryEffects(_environment?: Environment): MemoryEffects {
    return { reads: [UnknownLocation], writes: [UnknownLocation] };
  }

  /**
   * Can this op raise? TDZ, null deref, ToPrimitive coercion, user
   * `throw`, opaque call, getter trap, etc.
   */
  mayThrow(_environment?: Environment): boolean {
    return true;
  }

  /**
   * Can this op fail to terminate? Loops, opaque calls.
   */
  mayDiverge(_environment?: Environment): boolean {
    return true;
  }

  /**
   * Same inputs → same output. False for `Date.now`, `Math.random`,
   * mutable global loads, opaque calls.
   */
  get isDeterministic(): boolean {
    return false;
  }

  /**
   * Externally visible beyond heap (`console.*`, DOM, `debugger`,
   * opaque calls). DCE must not delete observable ops even when
   * their result is unused.
   */
  isObservable(_environment?: Environment): boolean {
    return true;
  }

  remap(_from: BasicBlock, _to: BasicBlock): void {
    // no-op
  }

  // -----------------------------------------------------------------
  // Lifecycle: attach / detach
  //
  // The single sanctioned mutation path for the def-use lists. Called
  // by `BasicBlock` whenever an op enters or leaves the IR (constructor,
  // appendOp, insertOpAt, replaceOp, terminal setter, removeOpAt) and
  // by `Environment.createOperation` for ops not yet placed in a block
  // (which only attaches results, since operands/successors aren't
  // yet meaningful — see the override pattern below).
  //
  // `Value._addUse` / `_removeUse` / `_setDefiner` / `_clearDefinerIf`
  // and `BasicBlock._addUse` / `_removeUse` are documented `@internal`
  // and must not be called from anywhere else.
  // -----------------------------------------------------------------

  /**
   * Attach this op to `block`. Single sanctioned path that toggles
   * `parentBlock` and links into every use-list (operands' uses,
   * results' definer, terminator successor blocks via TermOp's override).
   *
   * Pass `block === null` for the rare ops that are owned outside the
   * block graph — `FuncOp` (owned by a module) and the transient
   * `Environment.createOperation` path that pre-links results before
   * the op is placed.
   */
  attach(block: BasicBlock | null): void {
    if (this.parentBlock !== null) {
      throw new Error(
        `${this.constructor.name}#${this.id}.attach: already attached to bb${this.parentBlock.id}`,
      );
    }
    this.parentBlock = block;
    for (const value of this.operands()) {
      value._addUse(this);
    }
    for (const value of this.results()) {
      value._setDefiner(this);
    }
  }

  detach(): void {
    for (const value of this.operands()) {
      value._removeUse(this);
    }
    for (const value of this.results()) {
      value._clearDefinerIf(this);
    }
    this.parentBlock = null;
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
  //   - the op's own `place`, if declared, appears in `results()`.
  //
  // Concrete ops override to add op-specific invariants.
  // -----------------------------------------------------------------

  verify(): void {
    for (const operand of this.operands()) {
      if (operand == null) {
        throw new VerifyError(this, "has null operand");
      }
    }
    for (const def of this.results()) {
      if (def == null) {
        throw new VerifyError(this, "has null def");
      }
    }
    if (this.place !== undefined) {
      const defs = this.results();
      if (defs.length === 0 || defs[0] !== this.place) {
        // Not an error by default — multi-def ops (StoreLocal,
        // destructure) legally include `place` at a non-first index
        // or omit it when the primary result is a binding rather
        // than a value. We only require that `place` be in the list
        // if it's declared at all.
        if (!defs.includes(this.place)) {
          throw new VerifyError(this, `place ${this.place.print()} is not in results()`);
        }
      }
    }

    // Use-chain consistency: every operand lists `this` as a user.
    // Skipped for unattached ops — `attach()` runs on append.
    if (this.parentBlock !== null) {
      for (const operand of this.operands()) {
        if (!operand.users.has(this)) {
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
