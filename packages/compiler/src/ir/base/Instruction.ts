import { Environment } from "../../environment";
import { type Place } from "../core";
import { type Identifier } from "../core/Identifier";
import type { ModuleIR } from "../core/ModuleIR";

/**
 * Simulated opaque type for DeclarationId to prevent using normal numbers as ids
 * accidentally.
 */
const opaqueInstructionId = Symbol();
export type InstructionId = number & { [opaqueInstructionId]: "InstructionId" };

export function makeInstructionId(id: number): InstructionId {
  return id as InstructionId;
}

/**
 * Base class for all instructions.
 *
 * @param id - The unique identifier for the instruction.
 * @param place - The place where the instruction is stored.
 */
export abstract class BaseInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
  ) {}

  /**
   * Clones the instruction into `moduleIR`. The clone allocates fresh
   * IDs from `moduleIR.environment` and registers itself in that module.
   *
   * Most instructions ignore `moduleIR` aside from reading
   * `moduleIR.environment` to allocate. Instructions that own a nested
   * {@link FunctionIR} (arrow / function expressions, function
   * declarations, class/object methods, class properties) thread it into
   * `this.functionIR.clone(moduleIR)` so the deep-cloned nested function
   * lands in the correct module's function registry.
   *
   * The single-parameter signature avoids the implicit invariant of a
   * separate `environment` parameter (which must always equal
   * `moduleIR.environment` and isn't enforceable by the type system).
   */
  abstract clone(moduleIR: ModuleIR): BaseInstruction;

  /**
   * Rewrites the instruction to use values.
   *
   * @param values - A map of old values to new values.
   * @param options - Optional flags to control rewrite behavior.
   * @param options.rewriteDefinitions - When true, also rewrite definition
   *   sites (e.g. StoreLocal lval). Defaults to false because SSA needs
   *   definitions unchanged.
   * @returns The rewritten instruction.
   */
  abstract rewrite(
    values: Map<Identifier, Place>,
    options?: { rewriteDefinitions?: boolean },
  ): BaseInstruction;

  /**
   * Return the places that this instruction uses (operands / inputs).
   */
  abstract getOperands(): Place[];

  /**
   * Return the places that this instruction defines (outputs).
   *
   * Most instructions define only their own `place`. Instructions that
   * introduce additional bindings (e.g. pattern destructuring) override
   * this to include them.
   */
  getDefs(): Place[] {
    return [this.place];
  }

  /**
   * Whether this instruction has observable side effects (mutations, I/O,
   * throws). Instructions with side effects cannot be removed even when
   * their result is unused.
   *
   * @param environment - Environment for context-dependent lookups.
   *   ExpressionStatementInstruction uses this to resolve the wrapped
   *   expression's side-effect status via `placeToInstruction`.
   */
  public hasSideEffects(_environment: Environment): boolean {
    return true;
  }

  /**
   * Whether this instruction always produces the same result given the
   * same inputs. Non-deterministic instructions (e.g. reading mutable
   * state) cannot be deduplicated by CSE/GVN.
   */
  public get isDeterministic(): boolean {
    return true;
  }

  /**
   * Whether this instruction is pure — no side effects and deterministic.
   * Pure instructions can be freely removed, moved, or deduplicated.
   */
  public isPure(environment: Environment): boolean {
    return !this.hasSideEffects(environment) && this.isDeterministic;
  }

  /**
   * When this instruction is dead (none of its written places are used),
   * returns a replacement instruction that preserves only the side
   * effects, stripping the definition. Returns null if the instruction
   * can be removed entirely.
   *
   * For example, a dead `StoreLocal result = delete obj.x` returns an
   * `ExpressionStatement(delete obj.x)` — the definition of `result` is
   * stripped, but the side-effecting `delete` is preserved.
   */
  asSideEffect(): BaseInstruction | null {
    return null;
  }

  public print(): string {
    return `${this.place.print()} = ${this.constructor.name}`;
  }

  public toString(): string {
    return JSON.stringify({
      ...this, // oxlint-disable-line typescript/no-misused-spread
      kind: this.constructor.name,
    });
  }
}

// NOTE: The following class hierarchies are purely for organizational purposes
// and may not reflect the best way to structure these instructions.
// TODO: Rework instruction hierarchy to better reflect semantic relationships
// rather than just organizational grouping.

/**
 * Declaration instructions represent operations that introduce new named entities
 * in the program, such as classes.
 *
 * Examples:
 * - ClassDeclarationInstruction: Represents class declarations
 *   e.g., `class Bar {}`
 *
 * Note: Function and variable declarations are represented by their respective
 * value instructions (FunctionExpressionInstruction) combined with StoreLocal.
 */
export abstract class DeclarationInstruction extends BaseInstruction {}

/**
 * JSX instructions represent operations related to JSX.
 *
 * Examples:
 * - JSXElementInstruction: Represents JSX elements
 *   e.g., `<div />`
 *
 * - JSXFragmentInstruction: Represents JSX fragments
 *   e.g., `<></>`
 */
export abstract class JSXInstruction extends BaseInstruction {}

/**
/**
 * Memory instructions represent operations that manipulate the program's memory.
 *
 * Examples:
 * - StoreLocalInstruction: Represents storing a value at a place
 *   e.g., `let x = 5`
 *
 * - LoadLocalInstruction: Represents loading a value from a place
 *   e.g., `x`
 */
export abstract class MemoryInstruction extends BaseInstruction {}

/**
 * Module instructions represent declarations and operations that define a module's interface
 * and dependencies. These instructions handle imports and exports between modules, managing
 * how modules expose and consume functionality from one another.
 */
export abstract class ModuleInstruction extends BaseInstruction {}

/**
 * Pattern instructions represent operations that match patterns in the program.
 *
 * Examples:
 * - ArrayPatternInstruction: Represents an array pattern
 *   e.g., `[x, y]`
 *
 * - ObjectPatternInstruction: Represents an object pattern
 *   e.g., `{ x, y }`
 */
export abstract class PatternInstruction extends BaseInstruction {}

/**
 * Value instructions represent operations that compute or produce values in the IR.
 * These instructions form the core computational elements, handling operations that
 * result in a value being stored in their associated place.
 *
 * Examples:
 * - LiteralInstruction: Represents primitive values like numbers or strings
 *   e.g., `42` or `"hello"`
 *
 * - BinaryExpressionInstruction: Represents operations between two values
 *   e.g., `a + b` or `x * y`
 *
 * - ArrayExpressionInstruction: Represents array creation
 *   e.g., `[1, 2, 3]`
 */
export abstract class ValueInstruction extends BaseInstruction {}
