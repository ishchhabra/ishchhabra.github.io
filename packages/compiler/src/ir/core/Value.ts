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
 * An op-shaped user of a {@link Value}.
 *
 * Kept structural (any object with `getOperands()`) to avoid a cyclic
 * import with `Operation`. Every `Operation` satisfies this.
 */
export type User = {
  getOperands(): readonly Value[];
};

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
 *   - `#definer` / `#uses` — encapsulated def-use state. Private JS
 *     fields; external code reads via `definer` / `uses`. Mutation
 *     is possible only through the `_*` methods, which are reserved
 *     for `BasicBlock`'s use-chain helpers and
 *     `Environment.createOperation`.
 */
export class Value {
  public name: string;

  #definer: User | undefined = undefined;
  readonly #uses: Set<User> = new Set();

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

  /** The unique op that defines this value, or `undefined` for block params / unattached. */
  get definer(): User | undefined {
    return this.#definer;
  }

  /**
   * Read-only view of every op that uses this value. Backed by the
   * internal `Set<User>`, so `.size` / `.has(op)` / iteration are all
   * O(1) — but the `ReadonlySet` type prevents `.add` / `.delete` at
   * the type level so external code can't corrupt the use list.
   */
  get uses(): ReadonlySet<User> {
    return this.#uses;
  }

  /**
   * MLIR's `replaceAllUsesWith`. Rewrites every user of `this` to read
   * `other` instead by going through each user's owning block via the
   * sanctioned `BasicBlock.replaceOp` path. Keeps the def-use chain
   * consistent.
   */
  replaceAllUsesWith(other: Value): void {
    if (other === this) return;
    const users = Array.from(this.#uses);
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
  //   - BasicBlock use-chain helpers (registerUses / unregisterUses)
  //   - Environment.createOperation (sets definer once at op creation)
  //
  // Not for use from passes. Passes mutate the IR through
  // BasicBlock.{appendOp,replaceOp,insertOpAt,removeOpAt,...} and
  // Value.replaceAllUsesWith — those call through to these.
  // -------------------------------------------------------------------

  /** @internal */
  _addUse(user: User): void {
    this.#uses.add(user);
  }

  /** @internal */
  _removeUse(user: User): void {
    this.#uses.delete(user);
  }

  /** @internal */
  _setDefiner(user: User): void {
    this.#definer = user;
  }

  /** @internal */
  _clearDefinerIf(user: User): void {
    if (this.#definer === user) {
      this.#definer = undefined;
    }
  }
}
