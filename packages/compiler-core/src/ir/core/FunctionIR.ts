import { BasicBlock } from "./Block";
import { bindingPatternOperands, type BindingPatternTarget } from "./DestructurePattern";
import { ModuleIR } from "./ModuleIR";
import { Value } from "./Value";

declare const opaqueFunctionId: unique symbol;

/**
 * Stable identity of a function within an IR graph.
 *
 * Function ids are for module registries, diagnostics, maps, and
 * serialization. They are not operation ids and do not imply processing order.
 */
export type FunctionId = number & {
  readonly [opaqueFunctionId]: "FunctionId";
};

export function makeFunctionId(id: number): FunctionId {
  return id as FunctionId;
}

/**
 * Source-level parameter accepted by a function.
 *
 * Parameters are part of the function boundary, not body operations. Pattern
 * targets stay here so codegen can emit defaults, rest parameters, and
 * destructuring in the function header, preserving ECMAScript parameter-scope
 * semantics.
 */
export type FunctionParam =
  | {
      /**
       * Positional argument parameter.
       *
       * @example
       * ```js
       * function f(x) {}
       * function f({ x } = fallback) {}
       * ```
       */
      readonly kind: "argument";
      readonly target: BindingPatternTarget;
      readonly value: Value;
    }
  | {
      /**
       * Rest parameter.
       *
       * @example
       * ```js
       * function f(...args) {}
       * function f(...[first, second]) {}
       * ```
       */
      readonly kind: "rest";
      readonly target: BindingPatternTarget;
      readonly value: Value;
    }
  | {
      /**
       * Value captured from an enclosing function.
       *
       * Captures are not source parameters and are not emitted in the
       * JavaScript parameter list.
       */
      readonly kind: "capture";
      readonly value: Value;
    };

export type FunctionIRKind =
  | "function"
  | "arrow"
  | "method"
  | "class-method"
  | "class-constructor"
  | "class-field-initializer";

export interface FunctionIROptions {
  readonly params: readonly FunctionParam[];
  readonly blocks: readonly BasicBlock[];
  readonly kind?: FunctionIRKind;
  readonly name?: string | null;
  readonly isAsync?: boolean;
  readonly isGenerator?: boolean;
  readonly parentFunction?: FunctionIR | null;
}

/**
 * Function body represented as a control-flow graph.
 *
 * A function owns an ordered list of basic blocks. The first block is the entry
 * block. Function parameters are SSA values available at function entry;
 * captures model values imported from an enclosing lexical scope.
 */
export class FunctionIR {
  readonly #params: FunctionParam[];
  readonly #blocks: BasicBlock[];
  readonly #operandUses = new Set<Value>();

  /**
   * Module that currently owns this function.
   *
   * Null means the function is detached or still being assembled.
   */
  public ownerModule: ModuleIR | null = null;

  public readonly isAsync: boolean;
  public readonly isGenerator: boolean;
  public readonly kind: FunctionIRKind;
  public readonly name: string | null;
  public readonly parentFunction: FunctionIR | null;

  constructor(
    public readonly id: FunctionId,
    options: FunctionIROptions,
  ) {
    if (options.blocks.length === 0) {
      throw new Error(`Function#${id} must have an entry block`);
    }

    this.#params = [...options.params];
    this.#blocks = [];

    this.isAsync = options.isAsync ?? false;
    this.isGenerator = options.isGenerator ?? false;
    this.kind = options.kind ?? "function";
    this.name = options.name ?? null;
    this.parentFunction = options.parentFunction ?? null;
    this.attachOperandUses();

    for (const block of options.blocks) {
      this.addBlock(block);
    }
  }

  /**
   * Function parameters in source order, followed by captures.
   */
  public get params(): readonly FunctionParam[] {
    return this.#params;
  }

  /**
   * Blocks owned by this function in function order.
   */
  public get blocks(): readonly BasicBlock[] {
    return this.#blocks;
  }

  /**
   * Entry block of this function.
   */
  public get entryBlock(): BasicBlock {
    return this.#blocks[0];
  }

  /**
   * Replaces this function's parameter list.
   */
  public setParams(params: readonly FunctionParam[]): void {
    this.detachOperandUses();

    this.#params.length = 0;
    this.#params.push(...params);

    this.attachOperandUses();
  }

  /**
   * Values referenced by function-level structure.
   *
   * These are not block operations, but they are still value operands of the
   * function container. Examples include parameter default initializers,
   * computed parameter-pattern keys, and capture values.
   */
  public operands(): readonly Value[] {
    return this.#params.flatMap((param) => {
      switch (param.kind) {
        case "argument":
        case "rest":
          return bindingPatternOperands(param.target);

        case "capture":
          return [param.value];
      }
    });
  }

  private attachOperandUses(): void {
    for (const value of this.operands()) {
      value._addUser(this);
      this.#operandUses.add(value);
    }
  }

  private detachOperandUses(): void {
    for (const value of this.#operandUses) {
      value._removeUser(this);
    }

    this.#operandUses.clear();
  }

  /**
   * Adds a block to this function.
   */
  public addBlock(block: BasicBlock): void {
    if (this.#blocks.some((owned) => owned.id === block.id)) {
      throw new Error(`Block bb${block.id} already belongs to Function#${this.id}`);
    }

    if (block.ownerFunction !== null && block.ownerFunction !== this) {
      throw new Error(`Block bb${block.id} already belongs to another function`);
    }

    block.ownerFunction = this;
    this.#blocks.push(block);
  }

  /**
   * Removes a non-entry block from this function.
   */
  public removeBlock(block: BasicBlock): void {
    const index = this.#blocks.indexOf(block);
    if (index === -1) {
      throw new Error(`Block bb${block.id} does not belong to Function#${this.id}`);
    }

    if (index === 0) {
      throw new Error(`Cannot remove entry block bb${block.id} from Function#${this.id}`);
    }

    block.clear();
    block.ownerFunction = null;
    this.#blocks.splice(index, 1);
  }

  /**
   * Looks up an owned block by id.
   */
  public getBlock(id: BasicBlock["id"]): BasicBlock {
    const block = this.#blocks.find((candidate) => candidate.id === id);
    if (block === undefined) {
      throw new Error(`Block bb${id} does not belong to Function#${this.id}`);
    }

    return block;
  }
}
