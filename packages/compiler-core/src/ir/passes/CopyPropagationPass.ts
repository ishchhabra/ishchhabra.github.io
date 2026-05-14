import { AnalysisManager, PreservedAnalyses } from "../analysis";
import { FunctionIR, Operation, Value } from "../core";
import { BasicBlock } from "../core/Block";
import { canDropOperationEffects } from "../effects";
import { CopyValueOp } from "../ops/values/CopyValueOp";
import { FunctionPass, PassResult } from "./Pass";

type AliasMap = Map<Value, Value>;

/**
 * Creates a pass that rewrites uses of copy targets to their original source.
 *
 * Copy propagation is intentionally narrow: it only reasons about `CopyValueOp`.
 * Binding loads/stores, properties, globals, and heap memory need SSA or alias
 * analysis instead of this pass.
 *
 *
 * @example
 * ```txt
 * // Before
 * CopyValueOp($1, x)
 * CallOp(print, $1)
 *
 * // After
 * CopyValueOp($1, x)
 * CallOp(print, x)
 * ```
 */
export function createCopyPropagationPass(): FunctionPass {
  return {
    name: "copy-propagation",

    run(fn: FunctionIR, _analyses: AnalysisManager): PassResult {
      return new CopyPropagationPass(fn).run();
    },
  };
}

class CopyPropagationPass {
  readonly #entryAliases: Map<BasicBlock, AliasMap> = new Map();
  readonly #exitAliases: Map<BasicBlock, AliasMap> = new Map();
  #changed = false;

  constructor(readonly fn: FunctionIR) {}

  public run(): PassResult {
    this.computeBlockAliases();

    for (const block of this.fn.blocks) {
      this.rewriteBlock(block);
    }

    return {
      changed: this.#changed,
      preserved: this.#changed ? PreservedAnalyses.none() : undefined,
    };
  }

  /**
   * Computes copy aliases availabel at the start and end of every block.
   *
   * At merge points, an alias is kept only when every predecessor agrees on the
   * same canonical source. This makes cross-block propagation conservative.
   */
  private computeBlockAliases(): void {
    for (const block of this.fn.blocks) {
      this.#entryAliases.set(block, new Map());
      this.#exitAliases.set(block, new Map());
    }

    let changed = true;
    while (changed) {
      changed = false;

      for (const block of this.fn.blocks) {
        const entry = this.meetPredecessors(block);
        const exit = this.transferBlock(block, entry);

        if (!sameAliases(entry, this.#entryAliases.get(block)!)) {
          this.#entryAliases.set(block, entry);
          changed = true;
        }

        if (!sameAliases(exit, this.#exitAliases.get(block)!)) {
          this.#exitAliases.set(block, exit);
          changed = true;
        }
      }
    }
  }

  private meetPredecessors(block: BasicBlock): AliasMap {
    if (block === this.fn.entryBlock) {
      return new Map();
    }

    const predecessors = [...block.predecessors()];
    if (predecessors.length === 0) {
      return new Map();
    }

    const [first, ...rest] = predecessors;
    const result = new Map(this.#exitAliases.get(first) ?? []);

    for (const predecessor of rest) {
      const aliases = this.#exitAliases.get(predecessor) ?? new Map();

      for (const [target, source] of [...result]) {
        if (aliases.get(target) !== source) {
          result.delete(target);
        }
      }
    }

    return result;
  }

  private transferBlock(block: BasicBlock, entry: AliasMap): AliasMap {
    const aliases = new Map(entry);

    for (const op of block.operations) {
      if (op instanceof CopyValueOp) {
        const source = canonicalValue(op.source, aliases);
        if (canPropagateCopySource(source)) {
          aliases.set(op.target, source);
        } else {
          aliases.delete(op.target);
        }
      }
    }

    return aliases;
  }

  private rewriteBlock(block: BasicBlock): void {
    const aliases = new Map(this.#entryAliases.get(block) ?? []);

    for (const op of [...block.operations]) {
      const current = this.rewriteOperation(block, op, aliases);

      if (current instanceof CopyValueOp) {
        const source = canonicalValue(current.source, aliases);

        if (current.target === source) {
          block.removeOp(current);
          aliases.delete(current.target);
          this.#changed = true;
          continue;
        }

        if (canPropagateCopySource(source)) {
          aliases.set(current.target, source);
        } else {
          aliases.delete(current.target);
        }
      }
    }
  }

  private rewriteOperation(block: BasicBlock, op: Operation, aliases: AliasMap): Operation {
    const operands = op.operands();
    const rewritten = operands.map((operand) => canonicalValue(operand, aliases));

    if (sameValues(operands, rewritten)) {
      return op;
    }
    const replacement = op.withOperands(rewritten);
    block.replaceOp(op, replacement);
    this.#changed = true;
    return replacement;
  }
}

function canonicalValue(value: Value, aliases: AliasMap): Value {
  let current = value;
  const seen: Set<Value> = new Set();

  while (aliases.has(current)) {
    if (seen.has(current)) {
      throw new Error(`Copy propagation found an alias cycle at Value#${current.id}`);
    }

    seen.add(current);
    current = aliases.get(current)!;
  }

  return current;
}

function canPropagateCopySource(source: Value): boolean {
  const definer = source.definer;
  if (definer === undefined) return true;

  return canDropOperationEffects(definer.effects());
}

function sameAliases(left: AliasMap, right: AliasMap): boolean {
  if (left.size !== right.size) return false;

  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }

  return true;
}

function sameValues(left: readonly Value[], right: Value[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
