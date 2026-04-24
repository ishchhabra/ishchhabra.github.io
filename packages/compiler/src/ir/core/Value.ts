import type { Operation } from "./Operation";

/**
 * Simulated opaque type for ValueId to prevent using normal numbers as
 * ids accidentally.
 */
const opaqueValueId = Symbol();
export type ValueId = number & { [opaqueValueId]: "ValueId" };

export function makeValueId(id: number): ValueId {
  return id as ValueId;
}

/**
 * Simulated opaque type for DeclarationId.
 */
const opaqueDeclarationId = Symbol();
export type DeclarationId = number & { [opaqueDeclarationId]: "DeclarationId" };

export function makeDeclarationId(id: number): DeclarationId {
  return id as DeclarationId;
}

/**
 * SSA value — MLIR's `Value` analogue. The single unit of SSA identity
 * in this compiler. Every operand, op result, and block parameter is a
 * `Value`.
 *
 * Owns:
 *
 *   - `id` — stable project-wide id, used as map-key identity.
 *   - `declarationId` — source-level binding this value represents.
 *     Multiple Values share a `declarationId` when a source variable
 *     is reassigned across SSA versions (each version is its own
 *     Value; they all carry the same `declarationId`).
 *   - `name` — the string codegen emits. Default `$<declId>_<version>`
 *     is set by `Environment.createValue`; a handful of passes
 *     reassign it when they need a specific source-level name
 *     (e.g. export renaming).
 *   - `originalDeclarationId` — for SSA block-param Values only: the
 *     declaration the param merges values of. The param has its own
 *     fresh `declarationId`; this back-pointer lets out-of-SSA
 *     lowering reach the source variable.
 *   - `#def` / `#users` — encapsulated def-use state. Private JS
 *     fields; external code reads via `def` / `users`. Mutation
 *     is possible only through the `_*` methods, which are reserved
 *     for `BasicBlock`'s use-chain helpers and
 *     `Environment.createOperation`.
 */
export class Value {
  public name: string;

  #def: Operation | undefined = undefined;
  readonly #users: Set<Operation> = new Set();

  public originalDeclarationId: DeclarationId | undefined;

  constructor(
    public readonly id: ValueId,
    public readonly declarationId: DeclarationId,
  ) {
    this.name = `$${this.id}`;
  }

  // -------------------------------------------------------------------
  // Def-use accessors — MLIR-style
  // -------------------------------------------------------------------

  /**
   * The unique producer of this value.
   *
   * Operation results are defined by the operation that produced them.
   * Block parameters and values that have not been attached to an op have
   * no operation definer, so this returns `undefined`.
   */
  get def(): Operation | undefined {
    return this.#def;
  }

  /**
   * Operations that read this value.
   *
   * This is a set of users, not individual operand slots. If one
   * operation reads the same value twice, it appears here once. The
   * internal set is updated by block attachment/replacement helpers.
   */
  get users(): ReadonlySet<Operation> {
    return this.#users;
  }

  /**
   * MLIR's `replaceAllUsesWith`. Rewrites every user of `this` to read
   * `other` instead by going through each user's owning block via the
   * sanctioned `BasicBlock.replaceOp` path. Keeps the def-use chain
   * consistent.
   */
  replaceAllUsesWith(other: Value): void {
    if (other === this) return;
    const users = Array.from(this.#users);
    const map = new Map<Value, Value>([[this, other]]);
    for (const user of users) {
      const op = user as unknown as {
        parentBlock: { replaceOp(a: unknown, b: unknown): void } | null;
        rewrite(values: Map<Value, Value>): unknown;
      };
      const rewritten = op.rewrite(map);
      if (rewritten !== op && op.parentBlock !== null) {
        op.parentBlock.replaceOp(op, rewritten);
      }
    }
  }

  rewrite(values: Map<Value, Value>): Value {
    return values.get(this) ?? this;
  }

  print(): string {
    return this.name;
  }

  // -------------------------------------------------------------------
  // Internal mutation API — IR infrastructure only.
  //
  // Callers:
  //   - Operation.attach / Operation.detach (driven by BasicBlock)
  //   - Environment.createOperation (sets definer once at op creation)
  //
  // Not for use from passes. Passes mutate the IR through
  // BasicBlock.{appendOp,replaceOp,insertOpAt,removeOpAt,...} and
  // Value.replaceAllUsesWith — those call through to these.
  // -------------------------------------------------------------------

  /** @internal */
  _addUse(user: Operation): void {
    this.#users.add(user);
  }

  /** @internal */
  _removeUse(user: Operation): void {
    this.#users.delete(user);
  }

  /** @internal */
  _setDefiner(user: Operation): void {
    this.#def = user;
  }

  /** @internal */
  _clearDefinerIf(user: Operation): void {
    if (this.#def === user) {
      this.#def = undefined;
    }
  }
}
