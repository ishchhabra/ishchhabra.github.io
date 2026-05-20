import type { FunctionIR } from "./FunctionIR";
import type { Operation } from "./Operation";

declare const opaqueValueId: unique symbol;

/**
 * Stable identity of an SSA value within an IR graph.
 *
 * Value ids are for diagnostics, maps, and serialization. They are not
 * source variable ids and do not imply program order.
 */
export type ValueId = number & {
  readonly [opaqueValueId]: "ValueId";
};

export function makeValueId(id: number): ValueId {
  return id as ValueId;
}

declare const opaqueDeclarationId: unique symbol;

/**
 * Stable identity of a source-level declaration.
 *
 * Multiple SSA values may share one declaration id when they represent
 * different versions of the same source binding.
 */
export type DeclarationId = number & {
  readonly [opaqueDeclarationId]: "DeclarationId";
};

export function makeDeclarationId(id: number): DeclarationId {
  return id as DeclarationId;
}

export type ValueUser = Operation | FunctionIR;

export interface ValueUseSite {
  /**
   * IR object that owns the operand slot.
   */
  readonly user: ValueUser;

  /**
   * Index within `user.operands()`.
   */
  readonly operandIndex: number;
}

/**
 * Returns every operand occurrence that reads a value.
 *
 * `value.users` is intentionally a set of owning IR objects. If one operation
 * reads the same value twice, it appears once in `users` but twice here.
 *
 * @example
 * ```txt
 * ShortCircuitTerminatorOp test=$items exitTarget=join($items)
 *
 * value.users        => { ShortCircuitTerminatorOp }
 * valueUseSites(...) => [
 *   { user: ShortCircuitTerminatorOp, operandIndex: 0 },
 *   { user: ShortCircuitTerminatorOp, operandIndex: 1 },
 * ]
 * ```
 */
export function valueUseSites(value: Value): readonly ValueUseSite[] {
  const sites: ValueUseSite[] = [];

  for (const user of value.users) {
    user.operands().forEach((operand, operandIndex) => {
      if (operand === value) {
        sites.push({ user, operandIndex });
      }
    });
  }

  return sites;
}

/**
 * SSA value used by operation operands, operation results, and block parameters.
 *
 * A value is the unit of data dependency in the IR. Operation results have a
 * defining operation; block parameters do not. Users are IR objects that read
 * the value as an operand.
 */
export class Value {
  #definer: Operation | undefined = undefined;
  #users: Set<ValueUser> = new Set();

  constructor(
    public readonly id: ValueId,
    public readonly declarationId: DeclarationId | null = null,
  ) {}

  /**
   * Operation that defines this value, if any.
   *
   * Block parameters and detached values have no operation definer.
   */
  public get definer(): Operation | undefined {
    return this.#definer;
  }

  /**
   * IR objects that read this value.
   *
   * This is a set of users, not operand slots. If one user reads the same value
   * more than once, it appears once.
   */
  public get users(): ReadonlySet<ValueUser> {
    return this.#users;
  }

  /**
   * Registers an IR object as a user of this value.
   *
   * @internal
   */
  public _addUser(user: ValueUser): void {
    this.#users.add(user);
  }

  /**
   * Removes an IR object from this value's use-list.
   *
   * @internal
   */
  public _removeUser(user: ValueUser): void {
    this.#users.delete(user);
  }

  /**
   * Records the operation that defines this value.
   *
   * A value may have at most one definer. Reassigning the same definer is
   * idempotent; assigning a different definer is an IR invariant violation.
   *
   * @internal
   */
  public _setDefiner(definer: Operation): void {
    if (this.#definer !== undefined && this.#definer !== definer) {
      throw new Error(`Value#${this.id} already has a definer: ${this.#definer.id}`);
    }

    this.#definer = definer;
  }

  /**
   * Clears this value's defining operation.
   *
   * The caller must pass the current definer. Passing any other operation is an
   * IR invariant violation.
   *
   * @internal
   */
  public _clearDefiner(definer: Operation): void {
    if (this.#definer !== definer) {
      throw new Error(
        `Cannot clear definer for Value#${this.id}; it is not defined by this operation`,
      );
    }

    this.#definer = undefined;
  }
}

/**
 * Converts a value to a JavaScript variable name.
 *
 * This is used by code generation to print variable names.
 */
export function valueToJsName(value: Value): string {
  return `$${value.id}`;
}
